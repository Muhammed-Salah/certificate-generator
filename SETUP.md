# Certify — Complete Setup Guide

This guide walks you through every step to get Certify running locally and deployed to Vercel.
No steps are skipped. Follow them in order.

---

## Prerequisites

- **Node.js 18+** — https://nodejs.org (check: `node -v`)
- **npm 9+** — comes with Node (check: `npm -v`)
- **Git** — https://git-scm.com
- A **Google account** (for OAuth)
- A **Supabase account** — https://supabase.com (free)
- A **Vercel account** — https://vercel.com (free)

---

## Part 1 — Local Project Setup

### 1.1 Extract and install

```bash
# Unzip the project
unzip certify-app.zip
cd cert-app

# Install dependencies
npm install
```

### 1.2 Create your local environment file

```bash
cp .env.local.example .env.local
```

Leave it open — you'll fill it in during the Supabase steps below.

---

## Part 2 — Supabase Setup

Supabase is your database + file storage + authentication provider.

### 2.1 Create a Supabase project

1. Go to **https://supabase.com** and sign in
2. Click **"New project"**
3. Fill in:
   - **Name**: `certify` (or anything)
   - **Database password**: generate a strong one and save it
   - **Region**: pick the one closest to your users
4. Click **"Create new project"** — wait ~2 minutes for it to spin up

### 2.2 Get your API keys

1. In your Supabase project dashboard, click **"Project Settings"** (gear icon, bottom-left)
2. Click **"API"** in the left menu
3. You'll see two values — copy them into your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> The URL and anon key are safe to use in client-side code — they're designed for this.

### 2.3 Run the database schema

1. In your Supabase dashboard, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Open the file `supabase/schema.sql` from this project
4. Copy the **entire contents** and paste into the SQL editor
5. Click **"Run"** (or press Ctrl+Enter / Cmd+Enter)
6. You should see: `Success. No rows returned`

This creates:
- `templates` table — stores template metadata
- `template_configs` table — stores field placement settings
- `fonts` table — stores custom font metadata
- Storage buckets: `templates` and `fonts`
- Row Level Security policies (users can only see their own templates)

### 2.4 Verify storage buckets were created

1. Click **"Storage"** in the left sidebar
2. You should see two buckets: **`templates`** and **`fonts`**
3. If they're missing, run only the storage section of `schema.sql`:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'templates', 'templates', true, 52428800,
  ARRAY['image/png', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fonts', 'fonts', true, 10485760,
  ARRAY['font/ttf', 'font/otf', 'font/woff', 'font/woff2',
        'application/x-font-ttf', 'application/x-font-otf',
        'application/font-woff', 'application/font-woff2',
        'application/octet-stream']
) ON CONFLICT (id) DO NOTHING;
```

---

## Part 3 — Google OAuth Setup

This lets users log in with their Google account.

### 3.1 Create a Google Cloud project

1. Go to **https://console.cloud.google.com**
2. Click the project dropdown at the top → **"New Project"**
3. Name it `Certify` → click **"Create"**
4. Make sure your new project is selected in the dropdown

### 3.2 Enable the Google Identity API

1. In the left menu: **"APIs & Services"** → **"Library"**
2. Search for **"Google Identity"** or **"OAuth"**
3. Click **"Google Identity Platform"** → **"Enable"**

   *(If you can't find it, this step may not be required — proceed to 3.3)*

### 3.3 Create OAuth credentials

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"+ Create Credentials"** → **"OAuth client ID"**
3. If prompted to configure a consent screen first:
   - Click **"Configure Consent Screen"**
   - Choose **"External"** → **"Create"**
   - Fill in:
     - **App name**: `Certify`
     - **User support email**: your email
     - **Developer contact**: your email
   - Click **"Save and Continue"** through all steps
   - Click **"Back to Dashboard"**
   - Then go back to Credentials → Create Credentials → OAuth client ID
4. For **Application type**, choose **"Web application"**
5. **Name**: `Certify Web`
6. Under **"Authorised JavaScript origins"**, add:
   ```
   http://localhost:3000
   ```
7. Under **"Authorised redirect URIs"**, add:
   ```
   https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
   ```
   Replace `YOUR-PROJECT-REF` with your actual Supabase project reference
   (visible in your Supabase URL: `https://xxxxxxxxxxxx.supabase.co`)

8. Click **"Create"**
9. A popup shows your **Client ID** and **Client Secret** — keep this open

### 3.4 Connect Google to Supabase

1. Go back to your **Supabase dashboard**
2. Click **"Authentication"** → **"Providers"**
3. Find **"Google"** in the list and click it to expand
4. Toggle it **on**
5. Paste in:
   - **Client ID**: from Google (ends in `.apps.googleusercontent.com`)
   - **Client Secret**: from Google
6. Click **"Save"**

### 3.5 Set Supabase redirect URLs

1. In Supabase: **"Authentication"** → **"URL Configuration"**
2. Set **"Site URL"** to:
   ```
   http://localhost:3000
   ```
3. Under **"Redirect URLs"**, add:
   ```
   http://localhost:3000/**
   ```
4. Click **"Save"**

---

## Part 4 — Run Locally

```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

You should be redirected to the login page. Click **"Continue with Google"** and sign in.

> If you get a Google error saying the app isn't verified, click **"Advanced"** → **"Go to Certify (unsafe)"**. This is normal for apps in development mode that haven't been through Google's verification process.

---

## Part 5 — Deploy to Vercel

### 5.1 Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
```

Create a new repo on https://github.com/new (keep it private), then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/certify.git
git branch -M main
git push -u origin main
```

### 5.2 Import to Vercel

1. Go to **https://vercel.com** → **"Add New"** → **"Project"**
2. Connect your GitHub account if not already
3. Find and import your `certify` repository
4. Vercel auto-detects Next.js — no framework config needed
5. Under **"Environment Variables"**, add both:

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon key |

6. Click **"Deploy"**
7. Wait ~2 minutes — Vercel gives you a URL like `https://certify-abc123.vercel.app`

### 5.3 Update Google OAuth for production

1. Back in **Google Cloud Console** → **"Credentials"** → click your OAuth client
2. Under **"Authorised JavaScript origins"**, add:
   ```
   https://certify-abc123.vercel.app
   ```
3. Under **"Authorised redirect URIs"** — the Supabase one you already added is still valid, no change needed
4. Click **"Save"**

### 5.4 Update Supabase redirect URLs for production

1. In Supabase: **"Authentication"** → **"URL Configuration"**
2. Change **"Site URL"** to your Vercel URL:
   ```
   https://certify-abc123.vercel.app
   ```
3. Under **"Redirect URLs"**, add:
   ```
   https://certify-abc123.vercel.app/**
   ```
4. Keep `http://localhost:3000/**` in the list too (for local dev)
5. Click **"Save"**

---

## Part 6 — Using the App

### Workflow

```
1. Fonts (optional)   → Upload custom TTF/OTF/WOFF fonts
2. Templates          → Upload a PNG or PDF certificate background
3. Templates → Configure → Drag name/description markers to correct positions
4. Generate           → Pick template → enter names → preview → download
```

### Template requirements

- **PNG**: Any resolution. Higher is better — 2480×1754 (A4 300dpi) is ideal.
- **PDF**: Single-page. The first page is used as the background.

### CSV format for bulk generation

One name per line, no header required:
```
Alice Johnson
Bob Smith
Carol White
David Brown
```

### Configuring a template

1. Go to **Templates** → upload your certificate background
2. Click **"Configure"** on the template
3. Drag the **blue dot** to where the recipient's name should appear
4. If you need a description line, toggle **"Description Field"** on and drag the **amber box** to position it
5. Set fonts, sizes, colors, and alignment in the left panel
6. Click **"Save Configuration"**

### Generating certificates

1. Go to **Generate**
2. Select your configured template
3. Enter names manually (press Enter to add more) or upload a CSV
4. Click **Preview** — use the arrows to check each certificate
5. Choose **PNG** or **PDF** format
6. For bulk: choose **ZIP** (individual files) or **Merged PDF** (one file)
7. Click **Generate & Download**

---

## Troubleshooting

### "Invalid login credentials" / Google login fails
- Double-check the Client ID and Secret are correctly pasted in Supabase
- Make sure the redirect URI in Google exactly matches `https://YOUR-REF.supabase.co/auth/v1/callback`
- In development: make sure `http://localhost:3000/**` is in Supabase redirect URLs

### "new row violates row-level security policy"
- This means the SQL schema didn't run fully. Go to Supabase SQL Editor and re-run `supabase/schema.sql`

### Template image doesn't load / storage errors
- Check the storage buckets exist in Supabase → Storage
- Make sure the storage RLS policies from the schema were applied

### "supabase_url is required"
- Your `.env.local` file is missing or has wrong values
- Make sure you ran `cp .env.local.example .env.local` and filled both values

### Font not appearing in the font selector
- After uploading a font, refresh the Configure page — it dynamically loads fonts

### PDF certificates look blurry
- Use a high-resolution PNG template (2480×1754 or larger) instead of PDF input for best output quality
- The canvas renders at the template's native resolution

### Build fails on Vercel
- Make sure both env vars are set in Vercel → Project → Settings → Environment Variables
- Check the build logs for the specific error

---

## Project Structure

```
cert-app/
├── app/
│   ├── auth/
│   │   ├── login/page.tsx          # Google login page
│   │   └── callback/route.ts       # OAuth callback handler
│   ├── dashboard/
│   │   ├── layout.tsx              # Auth-protected layout
│   │   ├── page.tsx                # Overview page
│   │   ├── templates/
│   │   │   ├── page.tsx            # Template library
│   │   │   └── [id]/configure/     # Visual placement editor
│   │   ├── generate/page.tsx       # 4-step generation wizard
│   │   └── fonts/page.tsx          # Font management
│   ├── globals.css                 # Design tokens + Tailwind
│   └── layout.tsx                  # Root layout
├── components/
│   └── DashboardShell.tsx          # Sidebar navigation
├── lib/
│   ├── certGen.ts                  # Core: canvas rendering, PDF, ZIP
│   └── supabase/
│       ├── client.ts               # Browser Supabase client
│       └── server.ts               # Server Supabase client
├── middleware.ts                   # Auth protection for all routes
├── types/index.ts                  # TypeScript interfaces
├── supabase/schema.sql             # Full DB + storage setup
└── SETUP.md                        # This file
```
