import { createServerSupabaseClient } from "@/lib/supabase-server"

export interface Submission {
  id: string
  status: string
  video_url: string | null
  file_path: string | null
  campaign_id: string
  user_id: string
  created_at: string
  views: number
  transcription: string | null
  creator: {
    organization_name: string | null
  }
}

export interface Campaign {
  id: string
  title: string
  budget_pool: string
  rpm: string
  guidelines: string | null
  status: string | null
  video_outline: string | null
  brand: {
    name: string
    payment_verified: boolean
  }
  submission: Submission | null
}

export interface CreatorCampaign extends Campaign {
  remaining_budget: number
  has_insufficient_budget?: boolean
}

export const getCreatorCampaigns = async () => {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id) {
    return []
  }

  try {
    const { data: campaigns, error } = await supabase
      .from("campaigns")
      .select(
        `
        *,
        brand:brands!inner (
          id,
          payment_verified,
          user_id
        ),
        submission:submissions!left (
          id,
          status,
          video_url,
          file_path,
          campaign_id,
          views,
          user_id,
          created_at,
          transcription,
          creator:creators!inner (
            profile:profiles!inner (
              organization_name
            )
          )
        )
        `
      )
      .eq("status", "active")
      .eq("submission.user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching campaigns:", error)
      console.error("Error details:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
      throw error
    }

    // Get brand profiles in a separate query
    const brandUserIds = campaigns.map((campaign) => campaign.brand.user_id)

    const { data: brandProfiles, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, organization_name")
      .in("user_id", brandUserIds)

    if (profileError) {
      console.error("Error fetching brand profiles:", profileError)
    }

    // Create a map for quick lookup
    const profileMap = new Map(
      brandProfiles?.map((profile) => [
        profile.user_id,
        profile.organization_name,
      ]) || []
    )

    // Transform the data to match the expected format
    const transformedCampaigns: CreatorCampaign[] = campaigns.map(
      (campaign: any) => {
        const brandName = profileMap.get(campaign.brand.user_id)
        const hasInsufficientBudget = campaign.remaining_budget === 0

        // Filter submissions to only include the current user's submission
        const userSubmission = campaign.submission?.find(
          (sub: any) => sub.user_id === user.id
        )

        // Transform the submission to match the Submission type
        const transformedSubmission = userSubmission
          ? {
              id: userSubmission.id,
              status: userSubmission.status,
              video_url: userSubmission.video_url,
              file_path: userSubmission.file_path,
              campaign_id: userSubmission.campaign_id,
              user_id: userSubmission.user_id,
              created_at: userSubmission.created_at,
              views: userSubmission.views,
              transcription: userSubmission.transcription,
              creator: {
                organization_name:
                  userSubmission.creator?.profile?.organization_name || null,
              },
            }
          : null

        return {
          id: campaign.id,
          title: campaign.title,
          budget_pool: String(campaign.budget_pool),
          remaining_budget: campaign.remaining_budget,
          has_insufficient_budget: hasInsufficientBudget,
          rpm: String(campaign.rpm),
          guidelines: campaign.guidelines,
          status: campaign.status,
          video_outline: campaign.video_outline,
          brand: {
            name: brandName || "Unknown Brand",
            payment_verified: campaign.brand?.payment_verified || false,
          },
          submission: transformedSubmission,
        }
      }
    )

    return transformedCampaigns
  } catch (error) {
    console.error("Unexpected error in getCreatorCampaigns:", error)
    throw error
  }
}
