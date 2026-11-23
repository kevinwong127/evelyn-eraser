/**
 * Guards printed text against AI redraws.
 * The AI-cleaned image is used only as a MASK: wherever the AI kept ink,
 * we copy the ORIGINAL pixel; everywhere else becomes white.
 * Result can only contain original pixels or white — the AI can never
 * invent or alter letters (e.g. "take" turning into "fake").
 */
function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function toGray(d: Uint8ClampedArray, n: number) {
  const g = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) g[i] = (d[p] * 299 + d[p + 1] * 587 + d[p + 2] * 114) / 1000;
  return g;
}

/** Separable box dilation of a binary mask. */
export function dilate(mask: Uint8Array, w: number, h: number, r: number) {
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let count = 0;
    for (let x = 0; x < Math.min(r, w); x++) count += mask[row + x];
    for (let x = 0; x < w; x++) {
      if (x + r < w) count += mask[row + x + r];
      if (x - r - 1 >= 0) count -= mask[row + x - r - 1];
      tmp[row + x] = count > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = 0; y < Math.min(r, h); y++) count += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      if (y + r < h) count += tmp[(y + r) * w + x];
      if (y - r - 1 >= 0) count -= tmp[(y - r - 1) * w + x];
      out[y * w + x] = count > 0 ? 1 : 0;
    }
  }
  return out;
}

function percentile(g: Uint8Array, p: number) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  let target = g.length * p, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; }
  return 255;
}

export async function protectPrintedContent(originalUrl: string, aiUrl: string): Promise<string> {
  const [orig, ai] = await Promise.all([loadImg(originalUrl), loadImg(aiUrl)]);
  const w = orig.naturalWidth, h = orig.naturalHeight, n = w * h;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(ai, 0, 0, w, h);
  const aiData = ctx.getImageData(0, 0, w, h).data;
  ctx.drawImage(orig, 0, 0, w, h);
  const origImg = ctx.getImageData(0, 0, w, h);
  const od = origImg.data;

  const aiG = toGray(aiData, n);
  const oG = toGray(od, n);
  const aiBg = percentile(aiG, 0.9);
  const oBg = percentile(oG, 0.9);
  const aiInk = new Uint8Array(n);
  const oInk = new Uint8Array(n);
  let aiInkCount = 0;
  for (let i = 0; i < n; i++) {
    if (aiG[i] < aiBg - 60) { aiInk[i] = 1; aiInkCount++; }
    if (oG[i] < oBg - 45) oInk[i] = 1;
  }
  if (aiInkCount < n * 0.002) return aiUrl; // nothing usable

  // Find best global shift between AI image and original (AI may drift a few px).
  const S = Math.max(3, Math.round(w / 300));
  let best = { dx: 0, dy: 0, hit: -1 };
  for (let dy = -S; dy <= S; dy++) {
    for (let dx = -S; dx <= S; dx++) {
      let hit = 0;
      for (let y = Math.max(0, -dy); y < Math.min(h, h - dy); y += 3) {
        for (let x = Math.max(0, -dx); x < Math.min(w, w - dx); x += 3) {
          if (aiInk[y * w + x] && oInk[(y + dy) * w + x + dx]) hit++;
        }
      }
      if (hit > best.hit) best = { dx, dy, hit };
    }
  }
  // Shift AI ink mask onto original coordinates.
  const shifted = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const sy = y - best.dy;
    if (sy < 0 || sy >= h) continue;
    for (let x = 0; x < w; x++) {
      const sx = x - best.dx;
      if (sx >= 0 && sx < w && aiInk[sy * w + sx]) shifted[y * w + x] = 1;
    }
  }
  // Alignment check with a small tolerance.
  const oInkD = dilate(oInk, w, h, 2);
  let hit = 0, cnt = 0;
  for (let i = 0; i < n; i++) if (shifted[i]) { cnt++; if (oInkD[i]) hit++; }
  if (!cnt || hit / cnt < 0.7) {
    console.warn("protectPrintedContent: AI image misaligned, using AI output", cnt ? hit / cnt : 0);
    return aiUrl;
  }

  // Tight mask: old answers (e.g. filled-in bubbles) that the AI whitened stay white.
  const keep = dilate(shifted, w, h, Math.max(1, Math.round(w / 1200)));
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (!keep[i]) { od[p] = od[p + 1] = od[p + 2] = 255; }
  }
  ctx.putImageData(origImg, 0, 0);
  return c.toDataURL("image/png");
}

/**
 * Crop a rectangle (given in `cleanSrc` pixel coordinates) out of the ORIGINAL photo.
 * The local re-erase flow selects regions on the already-cleaned image, but the
 * protection step has to copy pixels from the untouched photo — otherwise a printed
 * word the AI already misread (e.g. "take" -> "fake") would simply be copied back.
 * Returns null when the crop cannot be made.
 */
export async function cropRectFromOriginal(
  originalSrc: string | null | undefined,
  cleanSrc: string,
  rect: { x: number; y: number; w: number; h: number },
): Promise<string | null> {
  if (!originalSrc || !cleanSrc || !rect.w || !rect.h) return null;
  try {
    const [orig, clean] = await Promise.all([loadImg(originalSrc), loadImg(cleanSrc)]);
    const sx = orig.naturalWidth / clean.naturalWidth;
    const sy = orig.naturalHeight / clean.naturalHeight;
    const cw = Math.max(1, Math.round(rect.w));
    const ch = Math.max(1, Math.round(rect.h));
    const c = document.createElement("canvas");
    c.width = cw;
    c.height = ch;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(
      orig,
      rect.x * sx,
      rect.y * sy,
      rect.w * sx,
      rect.h * sy,
      0,
      0,
      cw,
      ch,
    );
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}
