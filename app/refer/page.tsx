import { createServerSupabaseClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { DashboardHeader } from "@/components/dashboard-header"
import { ReferralClient } from "./client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function ReferPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    console.error("User error:", userError)
    redirect("/signin")
  }

  // Get user profile with type
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile) {
    console.error("Profile error:", profileError)
    redirect("/signin")
  }

  if (profile.user_type !== "creator") {
    redirect("/dashboard")
  }

  // Get creator's Stripe account status
  const { data: creator } = await supabase
    .from("creators")
    .select("stripe_account_id, stripe_account_status")
    .eq("user_id", user.id)
    .single()

  const hasStripeAccount = creator?.stripe_account_status === "active"

  // Get user's referral code
  let { data: referralData } = await supabase
    .from("referrals")
    .select("code")
    .eq("profile_id", user.id)
    .single()

  // If no referral code exists, create one
  if (!referralData) {
    const code = `CREATOR${Math.random().toString(36).substring(2, 8).toUpperCase()}`
    const { data: newCode, error: createError } = await supabase
      .from("referrals")
      .insert([
        {
          profile_id: user.id,
          code,
        },
      ])
      .select()
      .single()

    if (createError) {
      console.error("Error creating referral code:", createError)
      return <div>Error creating referral code</div>
    }

    referralData = newCode
  }

  // Get referred creators
  const { data: referredCreators, error: referredError } = await supabase
    .from("profiles")
    .select(
      `
      user_id,
      organization_name,
      created_at,
      creators!inner (
        user_id,
        stripe_account_id,
        stripe_account_status,
        submissions (
          creator_amount,
          status
        )
      )
    `
    )
    .eq("referred_by", user.id)

  console.log("Referred creators:", referredCreators)
  console.log("Referred error:", referredError)

  // Calculate total earned for each creator from their submissions
  const referredCreatorsWithEarnings =
    referredCreators?.map((creator: any) => ({
      user_id: creator.user_id,
      organization_name: creator.organization_name,
      created_at: creator.created_at,
      creators: [
        {
          total_earned:
            creator.creators?.submissions?.reduce((total: number, sub: any) => {
              if (
                sub.status === "fulfilled" &&
                creator.creators?.stripe_account_status === "active"
              ) {
                return total + (Number(sub.creator_amount) || 0)
              }
              return total
            }, 0) || 0,
        },
      ],
    })) || []

  return (
    <div className="min-h-screen bg-white">
      <DashboardHeader userType="creator" email={user.email || ""} />
      <main className="lg:ml-64 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 lg:py-8 pt-20 lg:pt-8">
          <div className="max-w-[800px] mx-auto">
            <ReferralClient
              referralCode={referralData?.code || ""}
              referredCreators={referredCreatorsWithEarnings}
              hasStripeAccount={hasStripeAccount}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
