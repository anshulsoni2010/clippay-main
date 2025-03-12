import { createServerSupabaseClient } from "@/lib/supabase-server"
import { NextResponse } from "next/server"
import { Deepgram } from "@deepgram/sdk"
import { spawn } from "child_process"
import { unlink, readFile, writeFile } from "fs/promises"
import { SupabaseClient } from "@supabase/supabase-js"
import { evaluateSubmission } from "@/lib/openai"

if (!process.env.DEEPGRAM_API_KEY) {
  throw new Error("Missing DEEPGRAM_API_KEY environment variable")
}

const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY)

// For Netlify, we need to export config
export const config = {
  runtime: "nodejs18.x",
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const { campaign_id, video_url, file_path } = await req.json()

    if (!campaign_id || (!video_url && !file_path)) {
      return new NextResponse("Missing required fields", { status: 400 })
    }

    // Create submission record
    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .insert({
        campaign_id,
        user_id: user.id,
        file_path,
        status: "pending",
      })
      .select()
      .single()

    if (submissionError) {
      console.error("Error creating submission:", submissionError)
      return new NextResponse("Error creating submission", { status: 500 })
    }

    // Process video in background
    processVideo(video_url || file_path, submission.id, supabase).catch(
      console.error
    )

    return NextResponse.json(submission)
  } catch (error) {
    console.error("Error in submissions route:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}

async function processVideo(
  videoSource: string,
  submissionId: string,
  supabase: SupabaseClient
) {
  try {
    // Download video to temp file
    const tempVideoPath = `/tmp/${submissionId}.mp4`
    const tempAudioPath = `/tmp/${submissionId}.wav`

    if (videoSource.startsWith("http")) {
      // Download from URL
      const response = await fetch(videoSource)
      if (!response.ok) throw new Error("Failed to fetch video")
      const arrayBuffer = await response.arrayBuffer()
      await writeFile(tempVideoPath, Buffer.from(arrayBuffer))
    } else {
      // Get from Supabase storage
      const { data, error } = await supabase.storage
        .from("videos")
        .download(videoSource)
      if (error) throw error
      const arrayBuffer = await data.arrayBuffer()
      await writeFile(tempVideoPath, Buffer.from(arrayBuffer))
    }

    // Extract audio using ffmpeg
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i",
        tempVideoPath,
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        tempAudioPath,
      ])

      ffmpeg.on("close", (code) => {
        if (code === 0) resolve(code)
        else reject(new Error(`ffmpeg exited with code ${code}`))
      })
    })

    // Transcribe with Deepgram
    const audioBuffer = await readFile(tempAudioPath)
    const source = {
      buffer: audioBuffer,
      mimetype: "audio/wav",
    }

    const response = await deepgram.transcription.preRecorded(source, {
      smart_format: true,
      punctuate: true,
    })

    if (!response?.results?.channels?.[0]?.alternatives?.[0]?.transcript) {
      throw new Error("Failed to get transcription from Deepgram")
    }

    const transcription =
      response.results.channels[0].alternatives[0].transcript

    // Get submission and campaign details
    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .select(
        `
        *,
        campaign:campaigns!inner (
          title,
          guidelines,
          video_outline,
          brand:brands!inner (
            auto_approval_enabled
          )
        )
      `
      )
      .eq("id", submissionId)
      .single()

    if (submissionError || !submission) {
      throw new Error("Failed to get submission details")
    }

    if (!submission.campaign || !submission.campaign.brand) {
      throw new Error(
        "Failed to get submission details: Campaign data not found"
      )
    }

    // Check if auto-approval is enabled for this brand
    if (submission.campaign.brand.auto_approval_enabled) {
      try {
        const evaluation = await evaluateSubmission(
          submission.campaign.title,
          submission.campaign.guidelines || "",
          submission.campaign.video_outline,
          transcription
        )

        // Only auto-approve/reject if confidence is high enough
        if (evaluation.confidence >= 0.8) {
          const newStatus = evaluation.approved ? "approved" : "rejected"
          await supabase
            .from("submissions")
            .update({
              status: newStatus,
              transcription,
              processed_at: new Date().toISOString(),
              auto_moderation_result: evaluation,
            })
            .eq("id", submissionId)

          // Create notification for the creator
          await supabase.from("notifications").insert({
            recipient_id: submission.user_id,
            type: `submission_${newStatus}`,
            title: `Submission ${newStatus === "approved" ? "Approved" : "Rejected"}`,
            message: `Your submission for "${submission.campaign.title}" has been automatically ${newStatus}. Reason: ${evaluation.reason}`,
            metadata: {
              submission_id: submissionId,
              campaign_title: submission.campaign.title,
              auto_moderated: true,
            },
          })

          return
        }
      } catch (error) {
        console.error("Error in auto-moderation:", error)
        // Continue with normal processing if auto-moderation fails
      }
    }

    // If we reach here, either auto-approval is disabled or evaluation wasn't conclusive
    // Update submission with transcription only
    await supabase
      .from("submissions")
      .update({
        transcription,
        processed_at: new Date().toISOString(),
      })
      .eq("id", submissionId)

    // Cleanup temp files
    await Promise.all([unlink(tempVideoPath), unlink(tempAudioPath)])
  } catch (err) {
    console.error("Error processing video:", err)
    const error = err as Error
    await supabase
      .from("submissions")
      .update({
        processing_error: error.message,
      })
      .eq("id", submissionId)
  }
}
