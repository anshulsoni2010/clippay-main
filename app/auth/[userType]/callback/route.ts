import { NextRequest, NextResponse } from "next/server"
import { createServerActionClient } from "@/app/auth/actions"
import { Database } from "@/types/supabase"

type Profile = Database["public"]["Tables"]["profiles"]["Row"]

// Get the project ref from the Supabase URL
function getProjectRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not defined")
  const matches = url.match(/https:\/\/([^.]+)\.supabase\.co/)
  if (!matches) throw new Error("Invalid Supabase URL format")
  return matches[1]
}

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userType: string }> }
) {
  const requestUrl = new URL(request.url)

  // Get and validate user type from URL params
  const { userType } = await params

  if (!userType || !["creator", "brand"].includes(userType)) {
    console.error("Invalid user type:", userType)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/signin?error=${encodeURIComponent("Invalid user type")}`
    )
  }

  const code = requestUrl.searchParams.get("code")
  const next = requestUrl.searchParams.get("next") || "/dashboard"

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/signin?error=No code provided`
    )
  }

  const supabase = await createServerActionClient()

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error("Session exchange error:", error)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_BASE_URL}/signin?error=${encodeURIComponent(error.message)}`
      )
    }

    const userId = data.session.user.id
    const accessToken = data.session.provider_token
    const refreshToken = data.session.provider_refresh_token

    if (userType === "creator" && accessToken && refreshToken) {
      const { error: storeError } = await supabase
        .from("creators")
        .update({
          youtube_access_token: accessToken,
          youtube_refresh_token: refreshToken,
          youtube_connected: true,
        })
        .eq("user_id", userId) // ✅ Use user_id if it's the primary key

      if (storeError) {
        console.error("Error storing YouTube tokens:", storeError)
      } else {
        console.log("YouTube tokens stored successfully!")
      }
    }

    // Fetch or create the user profile
    const { data: existingProfile, error: fetchError } = await supabase
      .from("profiles")
      .select("user_type, onboarding_completed")
      .eq("user_id", userId)
      .single()

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Failed to fetch profile:", fetchError)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_BASE_URL}/signin?error=${encodeURIComponent("Failed to fetch user profile")}`
      )
    }

    if (!existingProfile) {
      const { error: insertError } = await supabase.from("profiles").insert({
        user_id: userId,
        user_type: userType,
        onboarding_completed: false,
      })

      if (insertError) {
        console.error("Failed to create profile:", insertError)
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_BASE_URL}/signin?error=${encodeURIComponent("Failed to create user profile")}`
        )
      }
    }

    // Determine redirect URL based on the profile's user type
    const profile = existingProfile || {
      user_type: userType,
      onboarding_completed: false,
    }
    const onboardingPath =
      profile.user_type === "brand" ? "brand/profile" : "creator"
    const redirectUrl = !profile.onboarding_completed
      ? `${process.env.NEXT_PUBLIC_BASE_URL}/onboarding/${onboardingPath}`
      : `${process.env.NEXT_PUBLIC_BASE_URL}${next}`

    const response = NextResponse.redirect(redirectUrl)

    // Set the auth cookie
    const cookieName = `sb-${getProjectRef()}-auth-token`
    response.cookies.set(cookieName, JSON.stringify(data.session), {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })

    return response
  } catch (error) {
    console.error("Auth error:", error)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/signin?error=${encodeURIComponent("Authentication failed")}`
    )
  }
}
