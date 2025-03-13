# ClipPay Payment Flow Documentation

This document outlines the complete payment flow in ClipPay, including the current Stripe implementation, proposed PayPal integration, and the referral system.

## Table of Contents
1. [Current Stripe Payment Flow](#current-stripe-payment-flow)
   - [Brand Payment Process](#brand-payment-process)
   - [Creator Payment Process](#creator-payment-process)
   - [Platform Owner Revenue](#platform-owner-revenue)
2. [PayPal Integration](#paypal-integration)
   - [Dual Payment System Architecture](#dual-payment-system-architecture)
   - [Brand PayPal Flow](#brand-paypal-flow)
   - [Creator PayPal Flow](#creator-paypal-flow)
3. [Referral System](#referral-system)
   - [Referral Tracking](#referral-tracking)
   - [Referral Payment Calculation](#referral-payment-calculation)
4. [Database Schema Changes](#database-schema-changes)
5. [API Endpoints](#api-endpoints)
6. [UI Components](#ui-components)

---

## Current Stripe Payment Flow

### Brand Payment Process

1. **Account Setup**
   - Brand creates an account on ClipPay
   - Brand completes profile information
   - Brand connects a payment method via Stripe
     - Stripe customer ID is stored in `brands.stripe_customer_id`
     - Payment method is stored as default in Stripe

2. **Campaign Creation**
   - Brand creates a campaign with:
     - Total budget pool
     - RPM (Rate Per Mille/thousand views)
     - Campaign details (requirements, timeline, etc.)

3. **Content Approval**
   - Brand reviews creator submissions
   - Brand approves content that meets requirements
   - Approved content is eligible for payment

4. **Payment Processing**
   - Brand initiates payment for approved content
   - System calculates payment amount: `(views * RPM) / 1000`
   - Stripe payment intent is created with:
     - Total amount (creator payment + referral payment + platform fee)
     - Transfer group for tracking related transfers
     - Metadata for transaction tracking

5. **Payment Confirmation**
   - Payment is confirmed using brand's default payment method
   - Brand's credit card is charged
   - Campaign budget is updated
   - Transaction record is created with status "completed"
   - Submission status is updated to "fulfilled"

### Creator Payment Process

1. **Account Setup**
   - Creator registers on ClipPay
   - Creator completes profile information
   - Creator connects to Stripe Connect
     - Stripe Connect account ID stored in `creators.stripe_account_id`
     - Account status tracked in `creators.stripe_account_status`

2. **Content Submission**
   - Creator submits content for campaigns
   - Creator waits for brand approval

3. **Payment Receipt**
   - When brand processes payment, system creates a Stripe Transfer
   - Funds are transferred directly to creator's Stripe Connect account
   - Creator receives: `(views * RPM) / 1000`
   - Creator can withdraw funds based on their Stripe payout settings

### Platform Owner Revenue

1. **Service Fee Collection**
   - Platform charges 20% service fee on all payments
   - Fee calculation: `(creator payment + referral payment) * 0.2`
   - Fee is included in amount charged to brand
   - Fee remains with platform (not transferred out)

2. **Revenue Tracking**
   - All transactions are recorded in the `transactions` table
   - Service fee is tracked in `transactions.service_fee`

---

## PayPal Integration

### Dual Payment System Architecture

The proposed integration will allow both brands and creators to choose between Stripe and PayPal for payments and payouts respectively.

```
Payment Flow with Options:
Brand (Stripe or PayPal) → Platform → Creator (Stripe or PayPal)
```

### Brand PayPal Flow

1. **Account Setup**
   - Add PayPal connection option in brand settings
   - Store PayPal customer ID in `brands.paypal_customer_id`
   - Allow setting preferred payment method (Stripe/PayPal)

2. **Payment Processing**
   - Brand selects payment method during checkout
   - If PayPal selected:
     - Create PayPal order with total amount
     - Capture payment from brand
     - Record PayPal order ID in transaction

3. **Implementation Requirements**
   - PayPal SDK integration for payment processing
   - PayPal order creation and capture API endpoints
   - Payment method selection UI

### Creator PayPal Flow

1. **Account Setup**
   - Add PayPal connection option in creator settings
   - Store PayPal account ID in `creators.paypal_account_id`
   - Allow setting preferred payout method (Stripe/PayPal)

2. **Payout Processing**
   - System checks creator's preferred payout method
   - If PayPal selected:
     - Process payout via PayPal Payouts API
     - Record PayPal payout ID in transaction
   - If Stripe selected:
     - Process via existing Stripe Transfer mechanism

3. **Implementation Requirements**
   - PayPal Payouts API integration
   - Payout method selection UI
   - PayPal account verification process

### Cross-Platform Payments

The system must handle scenarios where the brand and creator use different payment platforms:

1. **Brand uses Stripe, Creator uses PayPal**
   - Charge brand via Stripe
   - Platform receives funds
   - Platform initiates PayPal payout to creator

2. **Brand uses PayPal, Creator uses Stripe**
   - Charge brand via PayPal
   - Platform receives funds
   - Platform initiates Stripe transfer to creator

3. **Both use same platform**
   - Process entirely within single platform
   - Reduces platform processing fees

---

## Referral System

### Referral Tracking

1. **Referral Relationship**
   - Creators can refer other creators to the platform
   - Referral relationship stored in `profiles.referred_by`
   - Referrer is eligible for commission on referred creator's earnings

2. **Referral Identification**
   - When processing payment for a creator
   - System checks if creator has a referrer (`profiles.referred_by`)
   - If referrer exists, calculate referral payment

### Referral Payment Calculation

1. **Fixed Rate Commission**
   - Referrer earns **$0.30 per 1000 views** on referred creator's content
   - Formula: `(referred_creator_views * 0.30) / 1000`

2. **Example Calculation**
   - Referred creator's content gets 10,000 views
   - Referrer earns: `(10,000 * 0.30) / 1000 = $3.00`

3. **Referral Payment Processing**
   - System checks referrer's preferred payout method
   - Processes payment via Stripe or PayPal accordingly
   - Updates referrer's `total_earned` in database

4. **Referral Payment Requirements**
   - Referrer must have active payout method (Stripe/PayPal)
   - Referred creator's submission must be approved and paid

---

## Database Schema Changes

To support PayPal integration, the following schema changes are required:

```sql
-- Brands table changes
ALTER TABLE brands
ADD COLUMN paypal_customer_id TEXT,
ADD COLUMN payment_method_preference TEXT DEFAULT 'stripe';

-- Creators table changes
ALTER TABLE creators
ADD COLUMN paypal_account_id TEXT,
ADD COLUMN paypal_account_status TEXT,
ADD COLUMN payout_method_preference TEXT DEFAULT 'stripe';

-- Transactions table changes
ALTER TABLE transactions
ADD COLUMN payment_processor TEXT DEFAULT 'stripe',
ADD COLUMN paypal_order_id TEXT,
ADD COLUMN paypal_payout_id TEXT;
```

---

## API Endpoints

### Existing Endpoints to Modify

1. `/api/payouts/process`
   - Add payment method selection
   - Add conditional logic for PayPal vs Stripe

2. `/api/payouts/confirm`
   - Add support for PayPal confirmation
   - Handle cross-platform scenarios

3. `/api/payment-methods`
   - Add PayPal payment methods
   - Support preference selection

### New Endpoints to Create

1. `/api/paypal/setup`
   - Connect brand's PayPal account
   - Store PayPal customer information

2. `/api/paypal/connect`
   - Connect creator's PayPal account
   - Verify account for payouts

3. `/api/paypal/payout`
   - Process PayPal payouts to creators
   - Handle batch payouts when possible

4. `/api/settings/payment-preferences`
   - Update payment/payout preferences
   - Toggle between Stripe and PayPal

---

## UI Components

### Brand Interface Updates

1. **Payment Method Settings**
   - Add PayPal connection option
   - Add payment method preference toggle
   - Show connected account status

2. **Checkout Process**
   - Add payment method selection
   - Support PayPal checkout flow
   - Maintain consistent UX between methods

### Creator Interface Updates

1. **Payout Method Settings**
   - Add PayPal connection option
   - Add payout method preference toggle
   - Show connected account status

2. **Earnings Dashboard**
   - Show payment method for each transaction
   - Display pending payouts by platform
   - Show referral earnings separately

### Admin Interface Updates

1. **Transaction Management**
   - Filter by payment processor
   - View payment details by platform
   - Manage failed transactions

2. **Reporting**
   - Track platform fees by payment processor
   - Monitor payment method adoption
   - Analyze referral system performance
