import { createServerSupabaseClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { DashboardHeader } from "@/components/dashboard-header"
import { PayoutsClient } from "./client"
import { Database } from "@/types/supabase"
import { TikTokAPI } from "@/lib/tiktok"

type Tables = Database["public"]["Tables"]
type SubmissionRow = Tables["submissions"]["Row"]
type CampaignRow = Tables["campaigns"]["Row"]
type ProfileRow = Tables["profiles"]["Row"]
type CreatorRow = Tables["creators"]["Row"]

interface SubmissionQueryResult {
  id: string
  status: string
  video_url: string | null
  file_path: string | null
  payout_due_date: string | null
  views: number
  campaign: {
    title: string
    rpm: string
    budget_pool: string
    referral_bonus_rate: string
    remaining_budget: string | number
    brand: {
      user_id: string
      profile: {
        organization_name: string
      }
    }
  }
  creator: {
    user_id: string
    stripe_account_id: string | null
    stripe_account_status: string | null
    tiktok_access_token: string | null
    profile: {
      organization_name: string
      referred_by: string | null
    }
  }
}

export interface SubmissionWithDetails {
  id: string
  status: string
  video_url: string | null
  file_path: string | null
  payout_due_date: string | null
  views: number
  campaign: Pick<
    CampaignRow,
    "title" | "rpm" | "budget_pool" | "referral_bonus_rate"
  > & {
    remaining_budget?: string | number
    brand: {
      profile: Pick<ProfileRow, "organization_name">
    }
  }
  creator: {
    user_id: string
    profile: Pick<ProfileRow, "organization_name" | "referred_by"> & {
      referrer?: {
        organization_name: string | null
        creator?: {
          stripe_account_id: string | null
          stripe_account_status: string | null
        }
      }
    }
    tiktok_access_token: string | null
  }
}

export default async function PayoutsPage() {
  const supabase = await createServerSupabaseClient()
  const tiktokApi = new TikTokAPI()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/signin")
  }

  // Get user profile and brand details to check if they're a brand and payment verified
  const { data: brand } = await supabase
    .from("brands")
    .select(
      `
      *,
      profiles!inner (
        user_type,
        organization_name
      )
    `
    )
    .eq("user_id", user.id)
    .single()

  if (!brand || brand.profiles?.user_type !== "brand") {
    redirect("/dashboard")
  }

  // Check if brand has completed payment setup
  if (!brand.payment_verified) {
    redirect("/onboarding/brand/payments")
  }

  // Get all approved submissions past their due date for this brand's campaigns only
  const { data: allSubmissions } = await supabase
    .from("submissions")
    .select(
      `
      id,
      status,
      video_url,
      file_path,
      payout_due_date,
      views,
      campaign:campaigns!inner (
        title,
        rpm,
        budget_pool,
        referral_bonus_rate,
        remaining_budget,
        brand:brands!inner (
          user_id,
          profile:profiles (
            organization_name
          )
        )
      ),
      creator:creators!inner (
        user_id,
        stripe_account_id,
        stripe_account_status,
        tiktok_access_token,
        profile:profiles!inner (
          organization_name,
          referred_by
        )
      )
    `
    )
    .returns<SubmissionQueryResult[]>()

  // Log all submissions before filtering
  console.log(
    "All submissions before filtering:",
    allSubmissions?.map((s: SubmissionQueryResult) => ({
      id: s.id,
      status: s.status,
      has_video_url: !!s.video_url,
      payout_due_date: s.payout_due_date,
      views: s.views,
      stripe_status: s.creator.stripe_account_status,
      has_stripe_account: !!s.creator.stripe_account_id,
      campaign_brand_id: s.campaign.brand.user_id,
    }))
  )

  // Get filtered submissions
  const { data: submissions, error: submissionsError } = await supabase
    .from("submissions")
    .select(
      `
      id,
      status,
      video_url,
      file_path,
      payout_due_date,
      views,
      campaign:campaigns!inner (
        title,
        rpm,
        budget_pool,
        referral_bonus_rate,
        remaining_budget,
        brand:brands!inner (
          profile:profiles (
            organization_name
          )
        )
      ),
      creator:creators!inner (
        user_id,
        stripe_account_id,
        stripe_account_status,
        tiktok_access_token,
        profile:profiles!inner (
          organization_name,
          referred_by
        )
      )
    `
    )
    .eq("status", "approved")
    .eq("campaign.brand.user_id", brand.user_id)
    .not("video_url", "is", null)
    .lte("payout_due_date", new Date().toISOString())
    .eq("creator.stripe_account_status", "active")
    .not("creator.stripe_account_id", "is", null)
    .gte("views", 10000)
    .order("payout_due_date", { ascending: true })
    .returns<SubmissionQueryResult[]>()

  console.log(
    "Filtered submissions:",
    submissions?.map((s: SubmissionQueryResult) => ({
      id: s.id,
      status: s.status,
      has_video_url: !!s.video_url,
      payout_due_date: s.payout_due_date,
      views: s.views,
      stripe_status: s.creator.stripe_account_status,
      has_stripe_account: !!s.creator.stripe_account_id,
    }))
  )

  if (submissionsError) {
    console.error("Error fetching submissions:", {
      code: submissionsError.code,
      message: submissionsError.message,
      details: submissionsError.details,
      hint: submissionsError.hint,
    })
    return <div>Error loading submissions</div>
  }

  // Fetch referrer information separately
  const submissionsWithReferrers = await Promise.all(
    (submissions || []).map(async (submission: SubmissionQueryResult) => {
      if (submission.creator.profile.referred_by) {
        const { data: referrerData } = await supabase
          .from("profiles")
          .select(
            `
            organization_name,
            creator:creators (
              stripe_account_id,
              stripe_account_status
            )
          `
          )
          .eq("user_id", submission.creator.profile.referred_by)
          .single()

        return {
          ...submission,
          creator: {
            ...submission.creator,
            profile: {
              ...submission.creator.profile,
              referrer: referrerData || { organization_name: null },
            },
          },
        } as SubmissionQueryResult
      }
      return submission
    })
  )

  // Group submissions by creator and calculate total earnings
  const submissionsByCreator = submissionsWithReferrers?.reduce(
    (
      total: Record<string, SubmissionQueryResult[]>,
      sub: SubmissionQueryResult
    ) => {
      const creatorId = sub.creator.user_id
      if (!total[creatorId]) {
        total[creatorId] = []
      }
      total[creatorId].push(sub)
      return total
    },
    {}
  )

  // Filter submissions based on total earnings and individual thresholds
  const qualifiedSubmissions = submissionsWithReferrers?.filter(
    (submission: SubmissionQueryResult) => {
      const creatorId = submission.creator.user_id
      const creatorSubmissions = submissionsByCreator?.[creatorId] || []

      // Calculate total earnings for this creator's pending submissions
      const totalPendingEarnings = creatorSubmissions.reduce(
        (total: number, sub: SubmissionQueryResult) => {
          if (sub.status === "approved") {
            const earnings = (sub.views * Number(sub.campaign.rpm)) / 1000
            return total + Math.min(earnings, Number(sub.campaign.budget_pool))
          }
          return total
        },
        0
      )

      // Calculate earnings for this specific submission
      const submissionEarnings = Math.min(
        (submission.views * Number(submission.campaign.rpm)) / 1000,
        Number(submission.campaign.budget_pool)
      )

      // Show submissions that earn at least $10 AND total pending earnings >= $25
      return submissionEarnings >= 10 && totalPendingEarnings >= 25
    }
  )

  console.log(
    "submissions",
    submissionsWithReferrers.map((s: SubmissionQueryResult) => s.creator)
  )

  // Update views for each submission
  if (submissionsWithReferrers) {
    for (const submission of submissionsWithReferrers) {
      if (submission.video_url && submission.creator.tiktok_access_token) {
        try {
          const { views } = await tiktokApi.getVideoInfo(
            submission.video_url,
            submission.creator.tiktok_access_token
          )

          // Update the views in the database
          await supabase
            .from("submissions")
            .update({ views })
            .eq("id", submission.id)

          // Update the views in our local submissions data
          submission.views = views
        } catch (error) {
          console.error("Error updating views for submission:", error)
        }
      }
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <DashboardHeader
        userType="brand"
        email={user.email || ""}
        organization_name={brand.profiles.organization_name}
      />
      <main className="lg:ml-64 min-h-screen pt-20 lg:pt-8">
        <PayoutsClient submissions={qualifiedSubmissions || []} />
      </main>
    </div>
  )
}
