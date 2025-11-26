// index.js
import express from "express";
import fetch from "node-fetch";
import sharp from "sharp";

const app = express();

// Tragetaschen-Mockup (Hintergrund) – gleich wie beim anderen Backend
const TOTE_MOCKUP_URL =
  "https://cdn.shopify.com/s/files/1/0958/7346/6743/files/Tragetasche_Mockup.jpg?v=1763713012";

// Einfacher In-Memory-Cache: artworkUrl -> fertiges PNG
// (damit Poster/Fußmatten nach dem ersten Aufruf extrem schnell sind)
const previewCache = new Map(); // key: artworkUrl, value: Buffer

// Healthcheck
app.get("/", (req, res) => {
  res.send(
    "teeinblue-rect-artwork-backend (ohne Background-Removal, nur Overlay auf Tragetaschen-Mockup) läuft."
  );
});

/**
 * GET /tote-preview?url=<URL_DES_ARTWORK-BILDES>
 *
 * Erwartet: Rechteckiges/quadratisches Artwork, bei dem der Hintergrund
 * NICHT entfernt werden soll (Poster, Fußmatte, vollflächige Designs).
 *
 * Ablauf:
 * 1. Artwork von der URL laden
 * 2. Artwork in PNG mit Alpha konvertieren und auf sinnvolle Breite skalieren
 * 3. Tragetaschen-Mockup laden
 * 4. Artwork auf Tasche positionieren
 * 5. Fertiges PNG zurückgeben
 */
app.get("/tote-preview", async (req, res) => {
  const artworkUrl = req.query.url;

  if (!artworkUrl || typeof artworkUrl !== "string") {
    return res
      .status(400)
      .json({ error: "Parameter 'url' fehlt oder ist ungültig." });
  }

  // 0. Cache-Hit? -> sofort zurück
  if (previewCache.has(artworkUrl)) {
    const cachedBuffer = previewCache.get(artworkUrl);
    res.setHeader("Content-Type", "image/png");
    return res.send(cachedBuffer);
  }

  try {
    // 1. Artwork laden
    const artResp = await fetch(artworkUrl);
    if (!artResp.ok) {
      return res.status(400).json({
        error: "Konnte Artwork-Bild nicht laden.",
        detail: `HTTP ${artResp.status}`,
      });
    }
    const artArrayBuf = await artResp.arrayBuffer();
    const artBuffer = Buffer.from(artArrayBuf);

    // 2. Artwork in PNG mit Alpha bringen + skalieren
    //    Keine Hintergrund-Entfernung – Design bleibt 1:1 so wie es ist.
    const artPngBuffer = await sharp(artBuffer)
      .ensureAlpha()
      .png()
      .toBuffer();

    // 3. Tragetaschen-Mockup laden
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

    // 4. Artwork auf eine sinnvolle Größe für die Tasche skalieren
    //    Werte kannst du exakt wie im anderen Backend halten oder separat tunen.
    const designOnToteBuffer = await sharp(artPngBuffer)
      .resize(Math.round(toteMeta.width * 0.42), null, {
        fit: "inside",
        fastShrinkOnLoad: true,
      })
      .png()
      .toBuffer();

    // Position auf der Tasche (gleich wie im anderen Backend, damit es konsistent ist)
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

    // 5. Ergebnis cachen
    previewCache.set(artworkUrl, finalBuffer);

    // 6. Fertiges Bild zurückgeben
    res.setHeader("Content-Type", "image/png");
    res.send(finalBuffer);
  } catch (err) {
    console.error("Fehler in /tote-preview (rect-backend):", err);
    return res.status(500).json({
      error: "Interner Fehler in /tote-preview",
      detail: err.message || String(err),
    });
  }
});

// Server starten
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Rect-Artwork-Backend läuft auf Port ${PORT}`);
});
