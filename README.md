# Reel Grab — Instagram media downloader

A small, working clone of saveclip-style tools: paste a public Instagram
link (reel, post, photo, or carousel) → preview it → download the original file.

## How it actually works

Pure HTML/JS can't pull this off alone — Instagram has no public "download"
API, and browsers can't reach into a private CDN response due to CORS.
So there are two pieces:

- **`public/index.html`** — the whole frontend. One file, no build step.
- **`server.js`** — a tiny Node/Express backend with two jobs:
  1. `POST /api/resolve` — takes the pasted URL and calls **yt-dlp**
     (an open-source tool that already knows how to talk to Instagram's
     internal endpoints) to get the direct media URL(s), thumbnail, and type.
  2. `GET /api/download` — streams that file back to the browser with a
     real filename and `Content-Disposition: attachment`, so the browser
     downloads it instead of just playing it.

## Setup

You need **Node.js 18+** and **`yt-dlp`** installed on the server machine.

```bash
# 1. Install yt-dlp (the thing that actually knows how to talk to Instagram)
pip install yt-dlp --break-system-packages
# or: brew install yt-dlp   /   sudo apt install yt-dlp

# 2. Install backend deps
cd reel-grab
npm install

# 3. Run it
npm start
```

Then open `http://localhost:3000`.

## What works / what won't

- ✅ Public reels, posts, photos, carousels (multiple items per post)
- ❌ Private accounts (would require login — deliberately not built, this
  crosses into account-scraping territory and isn't something I'd build)
- ❌ Stories older than 24h or highlights behind login gates
- ⚠️ Instagram changes its internal endpoints periodically. When that
  happens, update yt-dlp (`pip install -U yt-dlp`) — that's the piece
  that tracks Instagram's changes, so you don't have to touch your own code.

## Things worth knowing before you deploy this publicly

- **Terms of Service**: Instagram's ToS prohibits scraping/downloading
  content without permission. Tools like this exist and run publicly
  (saveclip, snapinsta, etc.), but it's a real legal gray area, not a
  guaranteed-safe zone — that risk is yours if you host it live.
- **Copyright**: the media still belongs to whoever posted it. A "for
  personal use" disclaimer somewhere on the page is standard for this
  category of tool.
- **Rate limiting**: add something like `express-rate-limit` on
  `/api/resolve` before going live, or one person can hammer your server
  (and your server's IP will get flagged by Instagram faster).
- **Hosting**: needs a real server (Render, Railway, a VPS, etc.) — not
  a static host like GitHub Pages, since the resolve/download logic needs
  Node + yt-dlp running server-side.
