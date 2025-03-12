# Supabase Project Duplication Guide

This guide provides step-by-step instructions for duplicating your Clip Pay Supabase project, including database schema, storage, authentication, and all related configurations.

## Table of Contents

1. [Creating a New Supabase Project](#1-creating-a-new-supabase-project)
2. [Database Schema Setup](#2-database-schema-setup)
3. [Storage Configuration](#3-storage-configuration)
4. [Authentication Setup](#4-authentication-setup)
5. [Row Level Security (RLS)](#5-row-level-security-rls)
6. [Environment Variables](#6-environment-variables)
7. [Data Migration](#7-data-migration)
8. [Testing Your Setup](#8-testing-your-setup)
9. [Command-Line Steps](#9-command-line-steps)

## 1. Creating a New Supabase Project

1. **Log in to Supabase Dashboard**
   - Go to [https://app.supabase.com/](https://app.supabase.com/)
   - Sign in with your credentials

2. **Create a New Project**
   - Click "New Project"
   - Select your organization
   - Name your project (e.g., "clip-pay-duplicate")
   - Set a secure database password
   - Choose the same region as your original project (for optimal performance)
   - Click "Create new project"

3. **Wait for Initialization**
   - Wait for Supabase to initialize your new project (usually takes 1-2 minutes)

## 2. Database Schema Setup

### Option A: Using Supabase CLI (Recommended)

1. **Install Supabase CLI** (if not already installed)
   ```bash
   npm install -g supabase
   ```

2. **Initialize Supabase in your project** (if not already done)
   ```bash
   supabase init
   ```

3. **Link your new project**
   ```bash
   supabase link --project-ref your-new-project-ref
   ```
   > Note: Find your project ref in the Supabase dashboard URL: `https://app.supabase.com/project/[project-ref]`

4. **Push your migrations**
   ```bash
   supabase db push
   ```

### Option B: Manual SQL Execution

1. **Access SQL Editor**
   - Go to the SQL Editor in your new Supabase project
   - Create a new query

2. **Execute Migration Files**
   Execute each migration file in order:
   - `20240320000000_create_submissions.sql`
   - `20240321000000_reorganize_stripe_ids.sql`
   - `20250128134253_add_brands_profiles_fk.sql`
   - `20250128134817_add_brands_profiles_relationship.sql`

## 3. Storage Configuration

1. **Create Storage Bucket**
   - Go to Storage in your new Supabase project
   - Click "New Bucket"
   - Name it "videos"
   - Set visibility to "Private" (recommended for security)
   - Click "Create bucket"

2. **Configure Storage RLS Policies**
   - Go to the "videos" bucket
   - Click on "Policies" tab
   - Create the following policies:

   **Allow authenticated users to upload their own files**
   ```sql
   CREATE POLICY "Users can upload their own files"
   ON storage.objects
   FOR INSERT
   TO authenticated
   WITH CHECK (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);
   ```

   **Allow users to read their own files**
   ```sql
   CREATE POLICY "Users can read their own files"
   ON storage.objects
   FOR SELECT
   TO authenticated
   USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);
   ```

   **Allow users to update their own files**
   ```sql
   CREATE POLICY "Users can update their own files"
   ON storage.objects
   FOR UPDATE
   TO authenticated
   USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);
   ```

   **Allow users to delete their own files**
   ```sql
   CREATE POLICY "Users can delete their own files"
   ON storage.objects
   FOR DELETE
   TO authenticated
   USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);
   ```

## 4. Authentication Setup

1. **Configure Email Authentication**
   - Go to Authentication → Settings → Email
   - Enable Email provider
   - Configure site URL: Set to your application URL
   - Set up redirect URLs (match your `process.env.NEXT_PUBLIC_BASE_URL` value)
   - Customize email templates if needed

2. **Set Up Google OAuth**
   - Go to Authentication → Providers → Google
   - Enable Google provider
   - Configure Client ID and Client Secret from your Google Cloud Console
   - Add authorized redirect URIs:
     - `https://your-app-url.com/auth/creator/callback`
     - `https://your-app-url.com/auth/brand/callback`

3. **Configure Password Reset**
   - Go to Authentication → Email Templates → Password Reset
   - Customize the template if needed
   - Ensure the redirect URL is set correctly

## 5. Row Level Security (RLS)

Your migration files include RLS policies, but verify they were created correctly:

1. **Verify Submissions Table Policies**
   - "Creators can view their own submissions"
   - "Creators can insert their own submissions"
   - "Brands can view submissions for their campaigns"
   - "Admins can view all submissions"

2. **Verify Profiles Table Policies**
   - Ensure users can read their own profiles
   - Ensure users can update their own profiles
   - Ensure admins can access all profiles

3. **Verify Campaigns Table Policies**
   - Ensure brands can manage their own campaigns
   - Ensure creators can view available campaigns
   - Ensure admins can access all campaigns

4. **Verify Other Table Policies**
   - Check policies for transactions, brands, creators, and other tables
   - Ensure they match your security requirements

## 6. Environment Variables

Update your project's environment variables with the new Supabase credentials:

1. **Local Development**
   Create or update your `.env.local` file:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-new-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-new-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-new-service-role-key
   ```

2. **Production Environment**
   If you're using deployment platforms like Vercel, update the environment variables there as well.

3. **Other Environment Variables**
   Ensure all other environment variables are updated as needed:
   - Stripe keys
   - TikTok API credentials
   - Any other third-party service credentials

## 7. Data Migration

If you want to migrate existing data:

### Option A: Using Supabase Dashboard

1. **Export Data from Original Project**
   - Go to your original project in Supabase
   - Go to Database → Backups
   - Click "Create a backup"
   - Download the backup file

2. **Import Data to New Project**
   - Go to your new project in Supabase
   - Go to SQL Editor
   - Upload and execute the backup SQL file

### Option B: Using pg_dump and pg_restore

1. **Export Data Using pg_dump**
   ```bash
   pg_dump -h db.your-original-project-id.supabase.co -p 5432 -U postgres -d postgres -F c -f dump.sql
   ```

2. **Import Data Using pg_restore**
   ```bash
   pg_restore -h db.your-new-project-id.supabase.co -p 5432 -U postgres -d postgres dump.sql
   ```

### Option C: Selective Data Migration

If you only want to migrate specific data:

1. **Export Specific Tables**
   - Use SQL queries to export data as CSV or JSON
   - Example: `SELECT * FROM profiles;`

2. **Import to New Project**
   - Use SQL INSERT statements or the Supabase dashboard to import the data

## 8. Testing Your Setup

1. **Test Authentication**
   - Try signing up with a new account
   - Try signing in with existing credentials
   - Test password reset functionality
   - Test Google OAuth sign-in

2. **Test Storage**
   - Upload a test file to the "videos" bucket
   - Verify you can retrieve the file
   - Test file deletion

3. **Test Database Operations**
   - Create test records in various tables
   - Verify RLS policies are working as expected
   - Test relationships between tables

4. **Test API Endpoints**
   - Verify all your API endpoints work with the new Supabase project
   - Test both authenticated and unauthenticated requests

## 9. Command-Line Steps

This section provides specific command-line steps for various parts of the duplication process.

### Setting Up Supabase CLI

1. **Install Supabase CLI**
   ```powershell
   # Using npm
   npm install -g supabase

   # Or using yarn
   yarn global add supabase
   ```

2. **Login to Supabase CLI**
   ```powershell
   supabase login
   ```
   Follow the prompts to authenticate with your Supabase account.

3. **Initialize Supabase in your project** (if not already done)
   ```powershell
   cd d:\clip-pay-main
   supabase init
   ```

4. **Link to your new Supabase project**
   ```powershell
   # Replace 'your-project-ref' with your actual project reference
   supabase link --project-ref your-project-ref
   ```

### Database Migration Commands

1. **Push migrations to your new project**
   ```powershell
   supabase db push
   ```

2. **Generate a database dump from your original project**
   ```powershell
   # Replace with your actual connection details
   pg_dump -h db.your-original-project-id.supabase.co -p 5432 -U postgres -d postgres -F c -f d:\clip-pay-main\supabase-backup.dump
   ```
   You'll be prompted for your database password.

3. **Restore database dump to your new project**
   ```powershell
   # Replace with your actual connection details
   pg_restore -h db.your-new-project-id.supabase.co -p 5432 -U postgres -d postgres d:\clip-pay-main\supabase-backup.dump
   ```
   You'll be prompted for your database password.

### Storage Migration Commands

1. **Download files from original storage bucket**
   ```powershell
   # Install AWS CLI if you haven't already
   winget install -e --id Amazon.AWSCLI

   # Set up environment variables for original project
   $env:SUPABASE_URL="https://your-original-project-id.supabase.co"
   $env:SUPABASE_KEY="your-original-service-role-key"

   # Download files (requires AWS CLI)
   aws s3 cp --recursive s3://your-original-project-id/storage/v1/object/public/videos/ ./temp-storage/ --endpoint-url $env:SUPABASE_URL
   ```

2. **Upload files to new storage bucket**
   ```powershell
   # Set up environment variables for new project
   $env:SUPABASE_URL="https://your-new-project-id.supabase.co"
   $env:SUPABASE_KEY="your-new-service-role-key"

   # Upload files (requires AWS CLI)
   aws s3 cp --recursive ./temp-storage/ s3://your-new-project-id/storage/v1/object/public/videos/ --endpoint-url $env:SUPABASE_URL
   ```

### Environment Variable Setup

1. **Create or update .env.local file**
   ```powershell
   # Create .env.local file
   @"
   NEXT_PUBLIC_SUPABASE_URL=https://your-new-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-new-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-new-service-role-key
   "@ | Out-File -FilePath d:\clip-pay-main\.env.local -Encoding utf8
   ```

2. **Verify environment variables**
   ```powershell
   # Display environment variables (without revealing sensitive info)
   Get-Content d:\clip-pay-main\.env.local | ForEach-Object { $_.Split('=')[0] }
   ```

### Testing Commands

1. **Test database connection**
   ```powershell
   # Using the Supabase CLI
   supabase db ping
   ```

2. **Run your Next.js application with new configuration**
   ```powershell
   cd d:\clip-pay-main
   npm run dev
   ```

3. **Check Supabase logs**
   ```powershell
   supabase logs
   ```

### Useful Supabase CLI Commands

1. **View Supabase project status**
   ```powershell
   supabase status
   ```

2. **Start local Supabase development environment**
   ```powershell
   supabase start
   ```

3. **Stop local Supabase development environment**
   ```powershell
   supabase stop
   ```

4. **Generate TypeScript types from your database schema**
   ```powershell
   supabase gen types typescript --local > types/supabase.ts
   ```

5. **Create a new migration file**
   ```powershell
   supabase migration new your_migration_name
   ```

## Additional Resources

- [Supabase Documentation](https://supabase.io/docs)
- [Supabase CLI Reference](https://supabase.io/docs/reference/cli)
- [Supabase JavaScript Client](https://supabase.io/docs/reference/javascript/introduction)
- [Supabase Auth Documentation](https://supabase.io/docs/guides/auth)
- [Supabase Storage Documentation](https://supabase.io/docs/guides/storage)
