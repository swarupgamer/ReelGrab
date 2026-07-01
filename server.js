// server.js — Reel Grab backend
//
// Two jobs only:
//   1. POST /api/resolve   { url }         -> list of downloadable media items (no download yet)
//   2. GET  /api/download  ?src=&name=     -> streams the actual file back with a real filename
//
// Resolution is done by shelling out to yt-dlp, which already knows how to talk
// to Instagram's internal endpoints for posts, reels, stories (public only) and
// carousels. We never store anything — everything is resolved live, per request.

const express = require("express");
const { execFile } = require("child_process");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Only ever proxy-download from Instagram/Facebook's own CDN hosts.
// This keeps /api/download from turning into an open "fetch any URL" proxy.
const ALLOWED_DOWNLOAD_HOSTS = [
  "cdninstagram.com",
  "fbcdn.net",
  "instagram.com",
];

function isAllowedHost(rawUrl) {
  try {
    const { hostname } = new URL(rawUrl);
    return ALLOWED_DOWNLOAD_HOSTS.some(
      (h) => hostname === h || hostname.endsWith("." + h)
    );
  } catch {
    return false;
  }
}

function looksLikeInstagramUrl(rawUrl) {
  try {
    const { hostname } = new URL(rawUrl);
    return hostname.endsWith("instagram.com");
  } catch {
    return false;
  }
}

// Runs `yt-dlp -j <url>` and parses the (possibly multi-line, for carousels) JSON output.
function resolveWithYtDlp(url) {
  return new Promise((resolve, reject) => {
    execFile(
      "yt-dlp",
      [
        "-f", "best",       // prefer a single muxed file so we don't need ffmpeg to merge
        "-j",                // dump metadata as JSON, one line per item
        "--no-warnings",
        "--socket-timeout", "20",
        url,
      ],
      { timeout: 30000, maxBuffer: 1024 * 1024 * 20 },
      (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(stderr || err.message));
        }
        const lines = stdout.trim().split("\n").filter(Boolean);
        if (!lines.length) return reject(new Error("No media found at that link."));
        try {
          const items = lines.map((line) => JSON.parse(line));
          resolve(items);
        } catch (e) {
          reject(new Error("Could not parse media info."));
        }
      }
    );
  });
}

app.post("/api/resolve", async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Paste an Instagram link first." });
  }
  if (!looksLikeInstagramUrl(url)) {
    return res.status(400).json({ error: "That doesn't look like an instagram.com link." });
  }

  try {
    const raw = await resolveWithYtDlp(url);

    const items = raw.map((item, i) => {
      const isImage = item.ext && ["jpg", "jpeg", "png", "webp"].includes(item.ext.toLowerCase());
      return {
        index: i,
        type: isImage ? "image" : "video",
        directUrl: item.url,
        thumbnail: item.thumbnail || item.thumbnails?.slice(-1)?.[0]?.url || null,
        caption: item.description || item.title || "instagram_media",
        uploader: item.uploader || item.channel || null,
        ext: item.ext || (isImage ? "jpg" : "mp4"),
        durationSec: item.duration || null,
      };
    });

    res.json({ count: items.length, items });
  } catch (err) {
    console.error(err.message);
    // yt-dlp's stderr usually says exactly why: private post, deleted, age-gated, etc.
    const msg = /private|login/i.test(err.message)
      ? "This post is private or requires login — only public posts can be fetched."
      : /unsupported url/i.test(err.message)
      ? "That link isn't a supported Instagram post/reel/story URL."
      : "Couldn't resolve that link. It may have been deleted or Instagram changed something on their end.";
    res.status(422).json({ error: msg });
  }
});

app.get("/api/download", async (req, res) => {
  const { src, name, ext } = req.query;

  if (!src || !isAllowedHost(src)) {
    return res.status(400).send("Invalid or disallowed source URL.");
  }

  try {
    const upstream = await fetch(src);
    if (!upstream.ok) throw new Error(`Upstream returned ${upstream.status}`);

    const safeName = (name || "instagram_media").replace(/[^a-z0-9_\-]/gi, "_").slice(0, 60);
    const safeExt = (ext || "mp4").replace(/[^a-z0-9]/gi, "");

    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.${safeExt}"`);
    if (upstream.headers.get("content-type")) {
      res.setHeader("Content-Type", upstream.headers.get("content-type"));
    }
    if (upstream.headers.get("content-length")) {
      res.setHeader("Content-Length", upstream.headers.get("content-length"));
    }
    upstream.body.pipe(res);
  } catch (err) {
    console.error(err.message);
    res.status(502).send("Could not fetch the file from the source.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Reel Grab running on http://localhost:${PORT}`));
