# Supabase Auth Configuration Guide

## Google OAuth Setup (Required for "Continue with Google")

If you see the error `"Unsupported provider: provider is not enabled"`, you need to enable Google OAuth in your Supabase project.

### Step-by-Step Setup

1. **Go to Supabase Dashboard**
   - URL: https://supabase.com/dashboard
   - Select your project: `aidr` (or your project name)

2. **Navigate to Authentication Settings**
   - Left sidebar: **Authentication** → **Providers**
   
3. **Enable Google Provider**
   - Find **Google** in the list
   - Toggle: **Enabled**
   - You will need Google OAuth credentials:
     - Client ID (from Google Cloud Console)
     - Client Secret (from Google Cloud Console)

4. **Get Google OAuth Credentials**
   
   a. Go to https://console.cloud.google.com/
   b. Create a new project or select existing
   c. **APIs & Services** → **Credentials** → **+ CREATE CREDENTIALS** → **OAuth client ID**
   d. Application type: **Web application**
   e. Authorized redirect URIs: Add your Supabase callback URL:
      ```
      https://[your-project-ref].supabase.co/auth/v1/callback
      ```
      Example:
      ```
      https://qacrbrailtemkzgwrxrt.supabase.co/auth/v1/callback
      ```
   f. Click **CREATE**
   g. Copy **Client ID** and **Client Secret**

5. **Enter Credentials in Supabase**
   - Paste Client ID into "Client ID" field
   - Paste Client Secret into "Client Secret" field
   - Click **Save**

6. **Add Authorized Redirect URIs in Google Cloud**
   - Back in Google Cloud Console, edit your OAuth client
   - Add these redirect URIs:
     ```
     https://qacrbrailtemkzgwrxrt.supabase.co/auth/v1/callback
     https://aidr.singularityrd.com/auth/callback
     http://localhost:3000/auth/callback
     ```

### Quick Test

After setup:
1. Go to your app: https://aidr.singularityrd.com/login
2. Click "Continue with Google"
3. You should see Google sign-in popup instead of the error

---

## Magic Link Configuration

If magic link emails are sent but don't work:

1. **Check Email Templates**
   - Supabase Dashboard → Authentication → Email Templates
   - Confirm URL in template matches your domain

2. **Site URL Configuration**
   - Supabase Dashboard → Authentication → URL Configuration
   - **Site URL**: `https://aidr.singularityrd.com`
   - **Redirect URLs**: Add `https://aidr.singularityrd.com/auth/callback`

---

## Troubleshooting

### "Unsupported provider" Error
- Google OAuth is not enabled → Follow steps above

### "Invalid redirect URL" Error
- URL Configuration in Supabase doesn't match your app URL
- Check Site URL and Redirect URLs

### Magic Link Not Received
- Check spam folder
- Verify email template is correct
- Check Supabase email provider settings (SendGrid/Resend/etc.)

### After Login, Redirect Doesn't Work
- Check `/auth/callback` route exists
- Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set

---

## Need Help?

If issues persist:
1. Check Supabase Auth logs: Dashboard → Authentication → Logs
2. Check browser console for errors
3. Verify all environment variables are set in Vercel
