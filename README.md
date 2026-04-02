# Certify — Certificate Generator

A clean, professional certificate generation web app built for small teams. Upload templates, configure name/description placement, and generate certificates individually or in bulk.

---

## Features

- **Template Management** — Upload PNG or PDF templates, rename, delete
- **Visual Configuration** — Drag-and-drop placement of name and description fields on a live canvas
- **Rich Text Descriptions** — Bold, italic, underline with per-template defaults
- **Bulk Generation** — CSV upload for hundreds of names; download as ZIP or merged PDF
- **Auto Font Sizing** — Automatically shrinks text if a name is too long
- **Custom Fonts** — Upload TTF/OTF/WOFF fonts, reusable across all templates
- **Google Auth** — Secure sign-in via Supabase Auth
- **Vercel Ready** — Deploys in one click

---

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | Next.js 14 (App Router), TypeScript |
| Styling  | Tailwind CSS                      |
| Auth     | Supabase Auth (Google OAuth)      |
| Database | Supabase (Postgres)               |
| Storage  | Supabase Storage                  |
| PDF      | jsPDF + pdfjs-dist                |
| ZIP      | JSZip                             |
| Canvas   | HTML5 Canvas (native)             |
| CSV      | PapaParse                         |

---

## Setup Guide

### 1. Clone and install

```bash
git clone <your-repo>
cd cert-app
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In **SQL Editor**, run the full contents of `supabase/schema.sql`
3. Go to **Authentication → Providers** and enable **Google**
   - Create OAuth credentials at [console.cloud.google.com](https://console.cloud.google.com)
   - Set redirect URI to: `https://your-project-ref.supabase.co/auth/v1/callback`

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Find these in: Supabase Dashboard → Project Settings → API

### 4. Run locally

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

### 5. Deploy to Vercel

```bash
npx vercel
```

Or connect your GitHub repo to Vercel and it will auto-deploy.

Add environment variables in Vercel Dashboard → Project → Settings → Environment Variables.

**Important**: Update your Supabase Auth redirect URLs:
- Go to Supabase → Authentication → URL Configuration
- Add `https://your-app.vercel.app/**` to Redirect URLs

---

## Supabase Storage

The schema creates two public storage buckets:

| Bucket      | Contents            | Max Size |
|-------------|---------------------|----------|
| `templates` | PNG/PDF templates   | 50 MB    |
| `fonts`     | TTF/OTF/WOFF fonts  | 10 MB    |

---

## Usage Guide

### Step 1 — Upload a Template
Go to **Templates** → drag-drop a PNG or PDF → it appears in your library.

### Step 2 — Configure Placement
Click **Configure** on any template. Drag the blue dot (name) and amber box (description) to the correct positions on the canvas. Set fonts, sizes, colors, and alignment. Save.

### Step 3 — Generate Certificates
Go to **Generate** → select template → enter names manually or upload a CSV → preview → choose PNG/PDF → download.

---

## CSV Format

The CSV should have one name per row. No header required:

```
Alice Johnson
Bob Smith
Carol White
```

Or with a header (it will be skipped automatically if it's non-numeric):

```
Name
Alice Johnson
Bob Smith
```

---

## Custom Fonts

Go to **Fonts** → upload TTF, OTF, WOFF, or WOFF2 files. They become immediately available in the font selector across all templates.

---

## Architecture Notes

- **Certificate rendering** uses the HTML5 Canvas API entirely in the browser — no server-side rendering needed
- **PDF input** uses `pdfjs-dist` to rasterize the first page at 2× resolution
- **PDF output** uses `jsPDF` with canvas-to-image conversion
- **Auto font sizing** shrinks font size 1px at a time until text fits within `max_width`
- **Bitmap caching** — the template image is loaded once per session and reused across bulk generation

---

## Project Structure

```
cert-app/
├── app/
│   ├── auth/
│   │   ├── login/page.tsx        # Google login page
│   │   └── callback/route.ts     # OAuth callback handler
│   ├── dashboard/
│   │   ├── layout.tsx            # Protected layout with sidebar
│   │   ├── page.tsx              # Overview / home
│   │   ├── templates/
│   │   │   ├── page.tsx          # Template library
│   │   │   └── [id]/configure/   # Template configuration editor
│   │   ├── generate/page.tsx     # Certificate generation wizard
│   │   └── fonts/page.tsx        # Font management
│   ├── globals.css               # Design tokens + utilities
│   └── layout.tsx                # Root layout
├── components/
│   └── DashboardShell.tsx        # Sidebar navigation shell
├── lib/
│   ├── certGen.ts                # Core generation logic (canvas → PDF/PNG/ZIP)
│   └── supabase/
│       ├── client.ts             # Browser Supabase client
│       └── server.ts             # Server Supabase client
├── types/index.ts                # TypeScript interfaces
├── middleware.ts                 # Auth protection middleware
└── supabase/schema.sql           # Full database schema
```
