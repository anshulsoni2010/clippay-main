# ClipPay Application Flow Documentation

## 1. Authentication Flow

### User Registration
- **Entry Point**: `/signup` route
- **Process**:
  1. User enters email and password
  2. System creates account in Supabase
  3. User is prompted to select account type (Brand or Creator)
  4. Profile record is created with `user_type` field set accordingly
  5. User is redirected to appropriate onboarding flow

### User Login
- **Entry Point**: `/signin` route
- **Process**:
  1. User enters credentials
  2. System authenticates via Supabase
  3. If authenticated, middleware checks onboarding status
  4. User is redirected to appropriate page based on onboarding status

### Password Reset
- **Entry Point**: `/forgot-password` route
- **Process**:
  1. User enters email
  2. System sends reset link
  3. User clicks link and is directed to `/reset-password`
  4. User sets new password and is redirected to login

## 2. Brand Onboarding Flow

### Step 1: Profile Setup
- **Route**: `/onboarding/brand/profile`
- **Process**:
  1. Brand enters organization name and details
  2. Data is saved to `profiles` table
  3. System redirects to payment setup

### Step 2: Payment Setup
- **Route**: `/onboarding/brand/payments`
- **Process**:
  1. System creates Stripe customer if not exists
  2. Stripe setup intent is created
  3. Brand adds payment method via Stripe Elements
  4. On successful setup:
     - `payment_verified` flag is set to true in `brands` table
     - `onboarding_completed` flag is set to true in `profiles` table
  5. Brand can also choose to "Skip for Now"
  6. Brand is redirected to dashboard

## 3. Creator Onboarding Flow

### Step 1: TikTok Connection
- **Route**: `/onboarding/creator/tiktok`
- **Process**:
  1. Creator initiates TikTok connection
  2. System redirects to TikTok OAuth
  3. Creator authorizes the application
  4. TikTok redirects back with access token
  5. System stores token in `creators` table
  6. `tiktok_connected` flag is set to true
  7. System redirects to profile setup

### Step 2: Profile Setup
- **Route**: `/onboarding/creator/profile`
- **Process**:
  1. Creator enters organization name and details
  2. Data is saved to `profiles` table
  3. `onboarding_completed` flag is set to true
  4. Creator is redirected to dashboard

## 4. Dashboard Flow

### Brand Dashboard
- **Route**: `/dashboard` (for brands)
- **Features**:
  1. View all created campaigns
  2. Campaign statistics (submissions, views)
  3. Quick access to create new campaigns
  4. Review pending submissions

### Creator Dashboard
- **Route**: `/dashboard` (for creators)
- **Features**:
  1. View available campaigns
  2. View submitted content
  3. Track earnings and views
  4. Access to payout information

## 5. Campaign Management Flow

### Campaign Creation (Brands)
- **Route**: `/campaigns/new`
- **Process**:
  1. Brand enters campaign details:
     - Title
     - Budget pool
     - RPM (Revenue Per Mille/thousand views)
     - Guidelines
     - Video outline
  2. Campaign is saved to `campaigns` table
  3. Campaign status is set to "active"
  4. Brand is redirected to campaign dashboard

### Campaign Browsing (Creators)
- **Route**: `/dashboard` (filtered view)
- **Process**:
  1. Creator browses available campaigns
  2. Views campaign details and requirements
  3. Decides to participate in campaigns

## 6. Content Submission Flow

### Creator Submission
- **Route**: `/submissions/new`
- **Process**:
  1. Creator selects campaign
  2. Uploads video content or provides TikTok URL
  3. System processes video and creates submission record
  4. Submission status is set to "pending"
  5. Brand is notified of new submission

### Submission Review (Brands)
- **Route**: `/submissions/{id}`
- **Process**:
  1. Brand reviews submitted content
  2. Can approve or reject submission
  3. If approved:
     - Submission status changes to "approved"
     - Payment is processed based on views
  4. If rejected:
     - Submission status changes to "rejected"
     - Creator can optionally resubmit

## 7. View Tracking Flow

### Automatic View Updates
- **Process**:
  1. System periodically checks TikTok API for view counts
  2. Updates view counts in `submissions` table
  3. Calculates earnings based on RPM and views
  4. Updates creator earnings

## 8. Payment Flow

### Brand Payment
- **Process**:
  1. When submission is approved, brand is charged
  2. Funds are held in escrow
  3. As views accumulate, funds are released to creator

### Creator Payout
- **Route**: `/payouts`
- **Process**:
  1. Creator views available balance
  2. Requests payout
  3. System processes payout via Stripe
  4. Creator receives funds in connected account

## 9. API Integration Flows

### Stripe Integration
- **Used for**:
  1. Brand payment method setup
  2. Payment processing
  3. Creator payouts

### TikTok API Integration
- **Used for**:
  1. Creator account connection
  2. Video metrics retrieval
  3. View count verification

## 10. Database Schema Overview

### Key Tables
- `profiles`: User profile information
- `brands`: Brand-specific data
- `creators`: Creator-specific data
- `campaigns`: Campaign information
- `submissions`: Content submissions
- `payouts`: Payment records

## 11. Middleware Protection Flow

- **Process**:
  1. Checks authentication status
  2. Enforces onboarding completion
  3. Redirects users to appropriate flows
  4. Ensures payment verification for payment-related routes
