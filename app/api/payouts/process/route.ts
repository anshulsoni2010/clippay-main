import { createServerSupabaseClient } from "@/lib/supabase-server"
import { NextResponse } from "next/server"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-01-27.acacia",
})

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()

  try {
    const { submissionId, verifiedViews } = await request.json()
    console.log("[DEBUG] Processing payment for submission:", submissionId)

    // Get the authenticated user first
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.error("[DEBUG] No session found")
      return NextResponse.json(
        { error: "Please sign in to continue" },
        { status: 401 }
      )
    }

    // Get the brand's details including payment setup
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select(
        `
        *,
        profiles!inner (
          user_type
        )
      `
      )
      .eq("user_id", user.id)
      .single()

    if (brandError) {
      console.error("Brand fetch error:", brandError)
      return NextResponse.json(
        { error: "Failed to fetch brand details" },
        { status: 500 }
      )
    }

    if (!brand) {
      console.error("No brand found for user:", user.id)
      return NextResponse.json(
        { error: "Brand account not found" },
        { status: 404 }
      )
    }

    if (brand.profiles.user_type !== "brand") {
      console.error("User is not a brand:", brand.profiles.user_type)
      return NextResponse.json(
        { error: "Only brand accounts can process payments" },
        { status: 403 }
      )
    }

    if (!brand.payment_verified) {
      console.error("Brand payment not verified:", brand.id)
      return NextResponse.json(
        { error: "Please complete payment setup first" },
        { status: 400 }
      )
    }

    if (!brand.stripe_customer_id) {
      console.error("No Stripe customer ID for brand:", brand.id)
      return NextResponse.json(
        { error: "Payment method not set up" },
        { status: 400 }
      )
    }

    // Get submission and campaign details
    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .select(
        `
        *,
        campaign:campaigns (
          id,
          title,
          rpm,
          budget_pool,
          referral_bonus_rate,
          remaining_budget
        ),
        creator:creators (
          user_id,
          stripe_account_id,
          stripe_account_status,
          profile:profiles (
            organization_name,
            referred_by
          )
        )
      `
      )
      .eq("id", submissionId)
      .single()

    console.log("[DEBUG] Submission details:", {
      id: submission?.id,
      views: submission?.views,
      campaignRpm: submission?.campaign?.rpm,
      campaignBudgetPool: submission?.campaign?.budget_pool,
      campaignReferralRate: submission?.campaign?.referral_bonus_rate,
      referredBy: submission?.creator?.profile?.referred_by,
    })

    if (submissionError || !submission) {
      console.error("Submission error:", submissionError)
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      )
    }

    // If there's a referrer, get their details in a separate query
    interface ReferrerData {
      organization_name: string
      creator: {
        stripe_account_id: string
        stripe_account_status: string
      }
    }

    let referrer: ReferrerData | null = null

    if (submission.creator.profile.referred_by) {
      const { data: referrerData } = await supabase
        .from("profiles")
        .select(
          `
          organization_name,
          creator:creators!inner (
            stripe_account_id,
            stripe_account_status
          )
        `
        )
        .eq("user_id", submission.creator.profile.referred_by)
        .single()

      if (referrerData?.creator) {
        const creatorData = Array.isArray(referrerData.creator)
          ? referrerData.creator[0]
          : referrerData.creator

        referrer = {
          organization_name: referrerData.organization_name,
          creator: {
            stripe_account_id: creatorData.stripe_account_id,
            stripe_account_status: creatorData.stripe_account_status,
          },
        }
        console.log("[DEBUG] Referrer details:", {
          hasStripeAccount: !!referrer.creator.stripe_account_id,
          stripeStatus: referrer.creator.stripe_account_status,
        })
      }
    }

    // Calculate initial payment amounts
    const initialPayment =
      Math.round(
        ((submission.views * Number(submission.campaign.rpm)) / 1000) * 100
      ) / 100
    const creatorPayment = initialPayment
    const referrerPayment = referrer ? initialPayment : 0

    // Calculate service fee (20% of total payments)
    const serviceFee =
      Math.round((creatorPayment + referrerPayment) * 0.2 * 100) / 100

    // Calculate total amount (both payments + service fee)
    const totalAmount = Math.round(
      (creatorPayment + referrerPayment + serviceFee) * 100
    )

    console.log("[DEBUG] Final payment details:", {
      creatorPayment,
      referrerPayment,
      serviceFee,
      totalAmount: totalAmount / 100,
    })

    // Check if we have enough in the budget pool
    const budgetPool = Number(
      submission.campaign.remaining_budget || submission.campaign.budget_pool
    )
    const totalNeeded = totalAmount / 100

    console.log("[DEBUG] Budget check:", {
      budgetPool,
      totalNeeded,
      hasEnoughBudget: budgetPool >= totalNeeded,
    })

    // Adjust payments if budget pool is insufficient
    let adjustedPaymentAmount = creatorPayment
    let adjustedReferrerPayment = referrerPayment

    if (totalNeeded > budgetPool) {
      if (budgetPool <= 0) {
        adjustedPaymentAmount = 0
        adjustedReferrerPayment = 0
      } else if (budgetPool <= creatorPayment) {
        adjustedPaymentAmount = budgetPool
        adjustedReferrerPayment = 0
      } else {
        adjustedPaymentAmount = creatorPayment
        adjustedReferrerPayment = budgetPool - creatorPayment
      }
      console.log("[DEBUG] Adjusted payments due to budget:", {
        adjustedPaymentAmount,
        adjustedReferrerPayment,
      })
    }

    // Validate referrer payment and Stripe account
    if (adjustedReferrerPayment > 0 && submission.creator.profile.referred_by) {
      const hasValidReferrer =
        referrer?.creator?.stripe_account_status === "active"
      if (!hasValidReferrer || !referrer?.creator?.stripe_account_id) {
        console.log(
          "[DEBUG] Resetting referrer payment - invalid Stripe account"
        )
        adjustedReferrerPayment = 0 // Reset referrer payment if no active Stripe account
      }
    }

    // Update remaining budget
    const totalDeduction = adjustedPaymentAmount + adjustedReferrerPayment
    const remainingBudget = budgetPool - totalDeduction

    console.log("[DEBUG] Updating campaign budget:", {
      currentBudget: budgetPool,
      totalDeduction,
      newRemainingBudget: remainingBudget,
    })

    // Update campaign with new remaining budget
    const { error: campaignUpdateError } = await supabase
      .from("campaigns")
      .update({
        remaining_budget: remainingBudget,
        has_insufficient_budget: remainingBudget < 10,
      })
      .eq("id", submission.campaign.id)

    if (campaignUpdateError) {
      console.error(
        "[DEBUG] Failed to update campaign budget:",
        campaignUpdateError
      )
      throw new Error("Failed to update campaign remaining budget")
    }

    // Validate final payment amount
    if (adjustedPaymentAmount <= 0) {
      return NextResponse.json(
        { error: "Insufficient budget for payment" },
        { status: 400 }
      )
    }

    if (!submission.creator.stripe_account_id) {
      return NextResponse.json(
        { error: "Creator has not connected their Stripe account" },
        { status: 400 }
      )
    }

    // Calculate final service fee and total amount for Stripe
    const finalServiceFee =
      Math.round(
        (adjustedPaymentAmount + adjustedReferrerPayment) * 0.2 * 100
      ) / 100
    const finalTotalAmount = Math.round(
      (adjustedPaymentAmount + adjustedReferrerPayment + finalServiceFee) * 100
    )

    // Create Stripe PaymentIntent with transfer group
    const transferGroup = `submission_${submission.id}`
    const paymentIntent = await stripe.paymentIntents.create({
      amount: finalTotalAmount,
      currency: "usd",
      customer: brand.stripe_customer_id,
      payment_method_types: ["card"],
      confirm: false,
      transfer_group: transferGroup,
      metadata: {
        submissionId: submission.id,
        creatorId: submission.creator.user_id,
        referrerId: referrer?.creator?.stripe_account_id
          ? submission.creator.profile.referred_by
          : null,
        creatorPayment: adjustedPaymentAmount,
        referrerPayment: adjustedReferrerPayment,
        serviceFee: finalServiceFee.toString(),
        transferGroup,
      },
    })

    console.log("[DEBUG] Created payment intent:", {
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      metadata: paymentIntent.metadata,
      transferGroup,
    })

    // Create creator transfer
    if (adjustedPaymentAmount > 0) {
      await stripe.transfers.create({
        amount: Math.round(adjustedPaymentAmount * 100),
        currency: "usd",
        destination: submission.creator.stripe_account_id,
        transfer_group: transferGroup,
        metadata: {
          type: "creator_payment",
          submissionId: submission.id,
          creatorId: submission.creator.user_id,
        },
      })
    }

    // Create referrer transfer if applicable
    if (adjustedReferrerPayment > 0 && referrer?.creator?.stripe_account_id) {
      await stripe.transfers.create({
        amount: Math.round(adjustedReferrerPayment * 100),
        currency: "usd",
        destination: referrer.creator.stripe_account_id,
        transfer_group: transferGroup,
        metadata: {
          type: "referrer_payment",
          submissionId: submission.id,
          referrerId: submission.creator.profile.referred_by,
        },
      })
    }

    // Create transaction record
    const { data: transaction, error: transactionError } = await supabase
      .from("transactions")
      .insert({
        brand_id: brand.id,
        submission_id: submission.id,
        amount: totalAmount / 100,
        service_fee: serviceFee,
        referrer_amount: adjustedReferrerPayment,
        referrer_id: submission.creator.profile.referred_by || null,
        stripe_payment_intent_id: paymentIntent.id,
        status: "pending",
        creator_payout_status: "pending",
      })
      .select()
      .single()

    if (transactionError) {
      console.error("[DEBUG] Transaction error:", transactionError)
      throw new Error("Failed to create transaction record")
    }

    // Update submission status
    const { error: updateError } = await supabase
      .from("submissions")
      .update({
        status: "payment_pending",
        views: submission.views,
        payout_amount: totalAmount / 100,
        creator_amount: adjustedPaymentAmount,
      })
      .eq("id", submission.id)

    if (updateError) {
      console.error("[DEBUG] Update error:", updateError)
      throw new Error("Failed to update submission status")
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      transactionId: transaction.id,
    })
  } catch (error) {
    console.error("[DEBUG] Payment processing error:", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to process payment",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}
