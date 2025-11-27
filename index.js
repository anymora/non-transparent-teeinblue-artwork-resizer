// index.js
import express from "express";
import fetch from "node-fetch";
import sharp from "sharp";

const app = express();

// Shopify blockt node-fetch → Browser User-Agent notwendig
const SHOPIFY_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/png,image/*,*/*",
};

// Mockups
const TOTE_MOCKUP_URL =
  "https://cdn.shopify.com/s/files/1/0958/7346/6743/files/Tragetasche_Mockup.jpg?v=1763713012";

const MUG_MOCKUP_URL =
  "https://cdn.shopify.com/s/files/1/0958/7346/6743/files/IMG_1833.jpg?v=1764169061";

// Cache
const previewCache = new Map();

app.get("/", (req, res) => {
  res.send("Upsell Backend läuft (Tasche + Tasse, NO BG Removal)");
});

// ---------- Hilfsfunktion ---------- //
async function loadImage(url) {
  const resp = await fetch(url, { headers: SHOPIFY_FETCH_HEADERS });
  if (!resp.ok) throw new Error(`Bild konnte nicht geladen werden: ${url}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  return buf;
}

// ---------- Haupt: Tasche ---------- //
app.get("/tote-preview", async (req, res) => {
  const artworkUrl = req.query.url;
  if (!artworkUrl) return res.status(400).json({ error: "url fehlt" });

  const cacheKey = "tote-" + artworkUrl;
  if (previewCache.has(cacheKey)) {
    res.setHeader("Content-Type", "image/png");
    return res.send(previewCache.get(cacheKey));
  }

  try {
    const artwork = await loadImage(artworkUrl);
    const artworkPng = await sharp(artwork).ensureAlpha().png().toBuffer();

    // Mockup laden (jetzt mit User-Agent → funktioniert ALLE ZEITEN)
    const toteBuffer = await loadImage(TOTE_MOCKUP_URL);
    const toteSharp = sharp(toteBuffer);
    const toteMeta = await toteSharp.metadata();

    // Artwork skalieren (42 %)
    const design = await sharp(artworkPng)
      .resize(Math.round(toteMeta.width * 0.42))
      .png()
      .toBuffer();

    // Position
    const offsetLeft = Math.round(toteMeta.width * 0.26);
    const offsetTop = Math.round(toteMeta.height * 0.46);

    const finalPng = await toteSharp
      .composite([{ input: design, left: offsetLeft, top: offsetTop }])
      .png()
      .toBuffer();

    previewCache.set(cacheKey, finalPng);
    res.setHeader("Content-Type", "image/png");
    res.send(finalPng);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- Haupt: Tasse ---------- //
app.get("/mug-preview", async (req, res) => {
  const artworkUrl = req.query.url;
  if (!artworkUrl) return res.status(400).json({ error: "url fehlt" });

  const cacheKey = "mug-" + artworkUrl;
  if (previewCache.has(cacheKey)) {
    res.setHeader("Content-Type", "image/png");
    return res.send(previewCache.get(cacheKey));
  }

  try {
    const artwork = await loadImage(artworkUrl);
    const artworkPng = await sharp(artwork).ensureAlpha().png().toBuffer();

    // Tassenmockup laden
    const mugBuffer = await loadImage(MUG_MOCKUP_URL);
    const mugSharp = sharp(mugBuffer);
    const mugMeta = await mugSharp.metadata();

    // Artwork skalieren (28 %)
    const design = await sharp(artworkPng)
      .resize(Math.round(mugMeta.width * 0.28))
      .png()
      .toBuffer();

    // Intensiv getestet → diese Koordinaten sitzen sauber zentriert
    const offsetLeft = Math.round(mugMeta.width * 0.36);
    const offsetTop = Math.round(mugMeta.height * 0.40);

    const finalPng = await mugSharp
      .composite([{ input: design, left: offsetLeft, top: offsetTop }])
      .png()
      .toBuffer();

    previewCache.set(cacheKey, finalPng);
    res.setHeader("Content-Type", "image/png");
    res.send(finalPng);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Server läuft auf Port " + PORT));
