# Bot Protection (CAPTCHA) Setup

This project uses **Cloudflare Turnstile** for bot protection on authentication forms.

## Why Turnstile?

- No annoying puzzles or image selection
- Usually invisible to real users
- Better UX than traditional CAPTCHA
- Free tier available

---

## Setup Instructions

### 1. Get Turnstile Credentials

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Turnstile** (left sidebar)
3. Click **Add Site**
4. Fill in:
   - **Site Name**: AIDR Landing
   - **Domains**: 
     - `aidr.singularityrd.com`
     - `localhost` (for development)
   - **Widget Mode**: Managed (recommended)
5. Click **Create**
6. Copy the **Site Key** and **Secret Key**

### 2. Add Environment Variables

Add to your `.env.local` (local development):

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAYourSiteKeyHere
```

Add to **Vercel Environment Variables** (production):
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = Your site key

### 3. Enable in Supabase (Optional but Recommended)

If you want Supabase to validate CAPTCHA on server side:

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. **Authentication** → **Settings** → **Bot and Abuse Protection**
3. Enable **CAPTCHA Protection**
4. Provider: **Turnstile**
5. Secret Key: Your Turnstile Secret Key
6. Save

---

## How It Works

The CAPTCHA appears in:
- Magic Link form (email sign-in)
- Sign up forms (if implemented)
- Password reset forms (if implemented)

**Note**: Google OAuth doesn't need CAPTCHA because Google already handles bot detection.

---

## Without CAPTCHA

If you don't set `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, the CAPTCHA component shows a warning but doesn't block functionality. The app works without it (but without bot protection).

---

## Testing

### Local Development

Add `localhost` to allowed domains in Turnstile settings:
```
localhost
localhost:3000
127.0.0.1
```

### Production

Production domain should be added automatically when you create the site, but verify:
```
aidr.singularityrd.com
*.vercel.app
```

---

## Troubleshooting

### "CAPTCHA not configured" message
- Site key is missing from environment variables

### "CAPTCHA failed to load"
- Check browser console for network errors
- Verify domain is added to Turnstile settings
- Check if script is being blocked by ad blocker

### CAPTCHA appears but can't verify
- Check if `window.turnstile` is loaded
- Verify site key is correct
- Check Cloudflare dashboard for widget errors

---

## Security Notes

- Never expose Secret Key in frontend code
- Server-side validation is recommended for production
- CAPTCHA alone isn't enough - use rate limiting too

---

## Alternative: hCaptcha

If you prefer hCaptcha instead of Turnstile:

1. Install package:
```bash
npm install @hcaptcha/react-hcaptcha
```

2. Replace `Turnstile.tsx` with hCaptcha implementation

3. Update environment variables to use `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`
