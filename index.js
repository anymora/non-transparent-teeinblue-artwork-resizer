// index.js
import express from "express";
import fetch from "node-fetch";
import sharp from "sharp";

const app = express();

// Mockups
const TOTE_MOCKUP_URL =
  "https://cdn.shopify.com/s/files/1/0958/7346/6743/files/Tragetasche_Mockup.jpg?v=1763713012";

const MUG_MOCKUP_URL =
  "https://cdn.shopify.com/s/files/1/0958/7346/6743/files/IMG_1833.jpg?v=1764169061";

// In-Memory Cache: key -> fertiges PNG
const previewCache = new Map();

// Healthcheck
app.get("/", (req, res) => {
  res.send("teeinblue-artwork-resizer (ohne BG-Removal, Tasche + Tasse) läuft.");
});

/**
 * Hilfsfunktion: Artwork von URL laden und als PNG mit Alpha zurückgeben
 */
async function loadArtworkAsPng(artworkUrl) {
  const artResp = await fetch(artworkUrl);
  if (!artResp.ok) {
    throw new Error(`Konnte Artwork-Bild nicht laden. HTTP ${artResp.status}`);
  }
  const artArrayBuf = await artResp.arrayBuffer();
  const artBuffer = Buffer.from(artArrayBuf);

  // Kein Hintergrund-Removal – nur nach PNG mit Alpha konvertieren
  const pngBuffer = await sharp(artBuffer).ensureAlpha().png().toBuffer();
  return pngBuffer;
}

/**
 * GET /tote-preview?url=<URL_DES_ARTWORKS>
 * Rechteckiges Artwork direkt auf Tragetaschen-Mockup legen.
 */
app.get("/tote-preview", async (req, res) => {
  const artworkUrl = req.query.url;

  if (!artworkUrl || typeof artworkUrl !== "string") {
    return res.status(400).json({ error: "Parameter 'url' fehlt oder ist ungültig." });
  }

  const cacheKey = "tote-" + artworkUrl;
  if (previewCache.has(cacheKey)) {
    res.setHeader("Content-Type", "image/png");
    return res.send(previewCache.get(cacheKey));
  }

  try {
    // 1. Artwork laden (ohne BG-Removal)
    const artworkPngBuffer = await loadArtworkAsPng(artworkUrl);

    // 2. Tragetaschen-Mockup laden
    const toteResp = await fetch(TOTE_MOCKUP_URL);
    if (!toteResp.ok) {
      return res.status(500).json({
        error: "Konnte Tragetaschen-Mockup nicht laden.",
        detail: `HTTP ${toteResp.status}`,
      });
    }
    const toteArrayBuf = await toteResp.arrayBuffer();
    const toteBuffer = Buffer.from(toteArrayBuf);

    const toteSharp = sharp(toteBuffer);
    const toteMeta = await toteSharp.metadata();

    if (!toteMeta.width || !toteMeta.height) {
      return res
        .status(500)
        .json({ error: "Konnte Größe des Tragetaschen-Mockups nicht lesen." });
    }

    // 3. Artwork skalieren (Breite ~42% der Tasche, wie im anderen Backend)
    const designOnToteBuffer = await sharp(artworkPngBuffer)
      .resize(Math.round(toteMeta.width * 0.42), null, {
        fit: "inside",
        fastShrinkOnLoad: true,
      })
      .png()
      .toBuffer();

    // Position auf der Tasche (wie im anderen Backend)
    const offsetLeft = Math.round(toteMeta.width * 0.26);
    const offsetTop = Math.round(toteMeta.height * 0.46);

    const finalBuffer = await toteSharp
      .composite([
        {
          input: designOnToteBuffer,
          left: offsetLeft,
          top: offsetTop,
        },
      ])
      .png()
      .toBuffer();

    // 4. Cache
    previewCache.set(cacheKey, finalBuffer);

    // 5. Antwort
    res.setHeader("Content-Type", "image/png");
    res.send(finalBuffer);
  } catch (err) {
    console.error("Fehler in /tote-preview:", err);
    return res.status(500).json({
      error: "Interner Fehler in /tote-preview",
      detail: err.message || String(err),
    });
  }
});

/**
 * GET /mug-preview?url=<URL_DES_ARTWORKS>
 * Rechteckiges Artwork direkt auf Tassen-Mockup legen (ohne BG-Removal),
 * klein zentriert in der Mitte der Tasse.
 */
app.get("/mug-preview", async (req, res) => {
  const artworkUrl = req.query.url;

  if (!artworkUrl || typeof artworkUrl !== "string") {
    return res.status(400).json({ error: "Parameter 'url' fehlt oder ist ungültig." });
  }

  const cacheKey = "mug-" + artworkUrl;
  if (previewCache.has(cacheKey)) {
    res.setHeader("Content-Type", "image/png");
    return res.send(previewCache.get(cacheKey));
  }

  try {
    // 1. Artwork laden (ohne BG-Removal)
    const artworkPngBuffer = await loadArtworkAsPng(artworkUrl);

    // 2. Tassen-Mockup laden
    const mugResp = await fetch(MUG_MOCKUP_URL);
    if (!mugResp.ok) {
      return res.status(500).json({
        error: "Konnte Tassen-Mockup nicht laden.",
        detail: `HTTP ${mugResp.status}`,
      });
    }
    const mugArrayBuf = await mugResp.arrayBuffer();
    const mugBuffer = Buffer.from(mugArrayBuf);

    const mugSharp = sharp(mugBuffer);
    const mugMeta = await mugSharp.metadata();

    if (!mugMeta.width || !mugMeta.height) {
      return res
        .status(500)
        .json({ error: "Konnte Größe des Tassen-Mockups nicht lesen." });
    }

    // 3. Artwork skalieren → ca. 28% der Breite der Tasse (wie im anderen Backend)
    const designOnMugBuffer = await sharp(artworkPngBuffer)
      .resize(Math.round(mugMeta.width * 0.28), null, {
        fit: "inside",
        fastShrinkOnLoad: true,
      })
      .png()
      .toBuffer();

    // 4. Positionierung – optisch mittig vorne auf der Tasse
    const offsetLeft = Math.round(mugMeta.width * 0.36);
    const offsetTop = Math.round(mugMeta.height * 0.40);

    const finalBuffer = await mugSharp
      .composite([
        {
          input: designOnMugBuffer,
          left: offsetLeft,
          top: offsetTop,
        },
      ])
      .png()
      .toBuffer();

    // 5. Cache
    previewCache.set(cacheKey, finalBuffer);

    // 6. Antwort
    res.setHeader("Content-Type", "image/png");
    res.send(finalBuffer);
  } catch (err) {
    console.error("Fehler in /mug-preview:", err);
    return res.status(500).json({
      error: "Interner Fehler in /mug-preview",
      detail: err.message || String(err),
    });
  }
});

// Server starten
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
