// index.js
import express from "express";
import fetch from "node-fetch";
import sharp from "sharp";

const app = express();

// Shopify CDN mag einen Browser-User-Agent
const SHOPIFY_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/png,image/*,*/*",
};

// Mockup-URLs
const TOTE_MOCKUP_URL =
  "https://cdn.shopify.com/s/files/1/0958/7346/6743/files/Tragetasche_Mockup.jpg?v=1763713012";

const MUG_MOCKUP_URL =
  "https://cdn.shopify.com/s/files/1/0958/7346/6743/files/IMG_1833.jpg?v=1764169061";

// In-Memory Cache: key -> PNG Buffer
const previewCache = new Map();

// Healthcheck
app.get("/", (req, res) => {
  res.send("teeinblue-artwork-resizer (NO BG Removal, Tasche + Tasse) läuft.");
});

// --------------------------------------------------
// Bild von URL laden (Shopify-kompatibel)
// --------------------------------------------------
async function loadImage(url) {
  const resp = await fetch(url, { headers: SHOPIFY_FETCH_HEADERS });
  if (!resp.ok) {
    throw new Error(`Bild konnte nicht geladen werden: ${url} (HTTP ${resp.status})`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

// --------------------------------------------------
// Artwork auf Mockup legen (ohne Hintergrundentfernung)
// --------------------------------------------------
async function placeArtworkOnMockup({ artworkUrl, mockupUrl, scale, offsetX, offsetY }) {
  // Artwork laden
  const artBuf = await loadImage(artworkUrl);

  // in PNG mit Alpha konvertieren (falls nötig)
  const artPng = await sharp(artBuf).ensureAlpha().png().toBuffer();

  // Mockup laden
  const mockBuf = await loadImage(mockupUrl);
  const mockSharp = sharp(mockBuf);
  const meta = await mockSharp.metadata();

  if (!meta.width || !meta.height) {
    throw new Error("Konnte Mockup-Abmessungen nicht lesen.");
  }

  // Artwork skalieren: Breite = scale * Mockup-Breite
  const scaledArt = await sharp(artPng)
    .resize(Math.round(meta.width * scale), null, {
      fit: "inside",
      fastShrinkOnLoad: true,
    })
    .png()
    .toBuffer();

  const left = Math.round(meta.width * offsetX);
  const top = Math.round(meta.height * offsetY);

  // Artwork auf Mockup compositen
  const finalBuffer = await mockSharp
    .composite([{ input: scaledArt, left, top }])
    .png()
    .toBuffer();

  return finalBuffer;
}

// --------------------------------------------------
// /tote-preview – Artwork auf Tragetasche
// --------------------------------------------------
app.get("/tote-preview", async (req, res) => {
  const artworkUrl = req.query.url;

  if (!artworkUrl || typeof artworkUrl !== "string") {
    return res.status(400).json({ error: "Parameter 'url' fehlt oder ist ungültig." });
  }

  const cacheKey = "TOTE_" + artworkUrl;
  if (previewCache.has(cacheKey)) {
    res.setHeader("Content-Type", "image/png");
    return res.send(previewCache.get(cacheKey));
  }

  try {
    const finalBuffer = await placeArtworkOnMockup({
      artworkUrl,
      mockupUrl: TOTE_MOCKUP_URL,
      scale: 0.42,   // ~42 % der Taschenbreite
      offsetX: 0.26, // leicht links
      offsetY: 0.46, // etwas nach unten
    });

    previewCache.set(cacheKey, finalBuffer);
    res.setHeader("Content-Type", "image/png");
    res.send(finalBuffer);
  } catch (err) {
    console.error("Fehler in /tote-preview (NO BG):", err);
    res.status(500).json({
      error: "Interner Fehler in /tote-preview (NO BG)",
      detail: err.message || String(err),
    });
  }
});

// --------------------------------------------------
// /mug-preview – Artwork auf Tasse
// --------------------------------------------------
app.get("/mug-preview", async (req, res) => {
  const artworkUrl = req.query.url;

  if (!artworkUrl || typeof artworkUrl !== "string") {
    return res.status(400).json({ error: "Parameter 'url' fehlt oder ist ungültig." });
  }

  const cacheKey = "MUG_" + artworkUrl;
  if (previewCache.has(cacheKey)) {
    res.setHeader("Content-Type", "image/png");
    return res.send(previewCache.get(cacheKey));
  }

  try {
    const finalBuffer = await placeArtworkOnMockup({
      artworkUrl,
      mockupUrl: MUG_MOCKUP_URL,
      scale: 0.325,  // 25 % größer als 0.26
      offsetX: 0.35, // etwas nach rechts
      offsetY: 0.37, // etwas nach unten
    });

    previewCache.set(cacheKey, finalBuffer);
    res.setHeader("Content-Type", "image/png");
    res.send(finalBuffer);
  } catch (err) {
    console.error("Fehler in /mug-preview (NO BG):", err);
    res.status(500).json({
      error: "Interner Fehler in /mug-preview (NO BG)",
      detail: err.message || String(err),
    });
  }
});

// --------------------------------------------------
// Serverstart
// --------------------------------------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Server läuft auf Port " + PORT);
});
