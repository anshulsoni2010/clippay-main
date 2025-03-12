import { createServerSupabaseClient } from "@/lib/supabase-server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-01-27.acacia",
})

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()

  try {
    const { paymentIntentId } = await request.json()
    console.log(
      "[DEBUG] Starting payment confirmation for paymentIntentId:",
      paymentIntentId
    )

    // Get the authenticated user first
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.error("[DEBUG] No user found in session")
      return NextResponse.json(
        { error: "Please sign in to continue" },
        { status: 401 }
      )
    }

    // Retrieve the payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

    if (!paymentIntent) {
      console.error("[DEBUG] Payment intent not found")
      return NextResponse.json({ error: "Payment not found" }, { status: 404 })
    }

    // Get the customer's default payment method
    const customer = await stripe.customers.retrieve(
      paymentIntent.customer as string
    )

    if ("deleted" in customer) {
      console.error("[DEBUG] Customer account deleted")
      return NextResponse.json(
        { error: "Customer account not found" },
        { status: 404 }
      )
    }

    if (!customer.invoice_settings.default_payment_method) {
      console.error("[DEBUG] No default payment method found for customer")
      return NextResponse.json(
        { error: "No default payment method found" },
        { status: 400 }
      )
    }

    const confirmedPayment = await stripe.paymentIntents.confirm(
      paymentIntentId,
      {
        payment_method: customer.invoice_settings
          .default_payment_method as string,
      }
    )

    if (confirmedPayment.status === "succeeded") {
      console.log("[DEBUG] Payment succeeded, updating transaction status")
      // Update transaction status
      const { error: transactionError } = await supabase
        .from("transactions")
        .update({ status: "completed" })
        .eq("stripe_payment_intent_id", paymentIntentId)

      if (transactionError) {
        console.error("[DEBUG] Transaction update error:", transactionError)
        throw new Error("Failed to update transaction status")
      }
      console.log("[DEBUG] Transaction status updated successfully")

      // Update submission status
      console.log("[DEBUG] Updating submission status to fulfilled")
      const { error: submissionError } = await supabase
        .from("submissions")
        .update({ status: "fulfilled" })
        .eq("id", paymentIntent.metadata.submissionId)

      if (submissionError) {
        console.error("[DEBUG] Submission update error:", submissionError)
        throw new Error("Failed to update submission status")
      }
      console.log("[DEBUG] Submission status updated successfully")

      // Update referrer's total earned if applicable
      if (
        paymentIntent.metadata.referrerId &&
        Number(paymentIntent.metadata.referrerPayment) > 0
      ) {
        console.log("[DEBUG] Updating referrer's total earned")
        const { data: referrer } = await supabase
          .from("creators")
          .select("total_earned")
          .eq("user_id", paymentIntent.metadata.referrerId)
          .single()

        const newTotalEarned =
          (referrer?.total_earned || 0) +
          Number(paymentIntent.metadata.referrerPayment)

        const { error: updateError } = await supabase
          .from("creators")
          .update({ total_earned: newTotalEarned })
          .eq("user_id", paymentIntent.metadata.referrerId)

        if (updateError) {
          console.error(
            "[DEBUG] Error updating referrer's total earned:",
            updateError
          )
        } else {
          console.log("[DEBUG] Referrer's total earned updated successfully")
        }
      }

      return NextResponse.json({ status: "succeeded" })
    }

    console.log(
      "[DEBUG] Payment not succeeded, returning status:",
      confirmedPayment.status
    )
    return NextResponse.json({ status: confirmedPayment.status })
  } catch (error) {
    console.error("[DEBUG] Payment confirmation error:", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to confirm payment",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}
