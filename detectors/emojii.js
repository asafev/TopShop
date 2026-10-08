function getEmojiFingerprint(options) {
  const cfg = Object.assign({
    sizeCssPx: 64,          // logical size
    glyphPx: 48,            // font size
    sampleGrid: 8,          // dHash grid width/height
    includeTiming: false,   // keep timing separate from stable hash
    emojiFontStack: "Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif",
    // Use a small set of mixed “simple” + ZWJ/VS sequences
    emojiCodepoints: [
      [0x1F600], // 😀
      [0x1F44D], // 👍
      [0x2764, 0xFE0F], // ❤️
      [0x1F9D1, 0x200D, 0x2695, 0xFE0F], // 🧑‍⚕️
      [0x1F469, 0x200D, 0x2764, 0xFE0F, 0x200D, 0x1F468], // 👩‍❤️‍👨
      [0x1F3F3, 0xFE0F, 0x200D, 0x26A7, 0xFE0F], // 🏳️‍⚧️
      [0x1F441, 0xFE0F, 0x200D, 0x1F5E8, 0xFE0F], // 👁️‍🗨️
      [0x1F680]  // 🚀
    ]
  }, options || {});

  function u32(n) { return n >>> 0; }

  // FNV-1a 32-bit over bytes (simple, stable mixing)
  function fnv1a32(bytes) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = u32(Math.imul(h, 0x01000193));
    }
    return h;
  }

  function pushU32(arr, v) {
    arr.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255);
  }

  function pushI16(arr, v) {
    const x = (v & 0xffff);
    arr.push(x & 255, (x >>> 8) & 255);
  }

  function quantizeFloat(f, scale) {
    // quantize into signed 16-bit-ish range
    const v = Math.round((f || 0) * scale);
    return Math.max(-32768, Math.min(32767, v));
  }

  function computeAlphaDHash(imageData, w, h, grid) {
    // Build grid x grid average alpha, then compute horizontal dHash (grid x (grid-1))
    const cellW = w / grid;
    const cellH = h / grid;

    const avg = new Array(grid * grid).fill(0);
    const counts = new Array(grid * grid).fill(0);

    const data = imageData.data;

    for (let y = 0; y < h; y++) {
      const gy = Math.min(grid - 1, (y / cellH) | 0);
      for (let x = 0; x < w; x++) {
        const gx = Math.min(grid - 1, (x / cellW) | 0);
        const idx = (y * w + x) * 4;
        const a = data[idx + 3];
        const gi = gy * grid + gx;
        avg[gi] += a;
        counts[gi] += 1;
      }
    }

    for (let i = 0; i < avg.length; i++) {
      avg[i] = counts[i] ? (avg[i] / counts[i]) : 0;
    }

    // dHash bits packed into two u32s (since grid=8 => 8*7=56 bits)
    let bitsLo = 0, bitsHi = 0;
    let bitPos = 0;

    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid - 1; gx++) {
        const left = avg[gy * grid + gx];
        const right = avg[gy * grid + gx + 1];
        const bit = right > left ? 1 : 0;

        if (bitPos < 32) bitsLo |= (bit << bitPos);
        else bitsHi |= (bit << (bitPos - 32));
        bitPos++;
      }
    }

    return { bitsLo: u32(bitsLo), bitsHi: u32(bitsHi), bitLen: bitPos };
  }

  function computeBitmapStats(imageData, w, h) {
    const data = imageData.data;
    let nonZeroA = 0;
    let sumX = 0, sumY = 0;
    let edgeLike = 0;

    // Unique colors on non-transparent pixels (quantized to reduce noise)
    // Quantize RGB to 4 bits each => 12-bit bucket (0..4095)
    const seen = new Uint8Array(4096);
    let uniqueColorCount = 0;

    // Simple edge-ish count: count alpha changes vs right/bottom neighbors
    function alphaAt(x, y) {
      const i = (y * w + x) * 4;
      return data[i + 3];
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];

        if (a > 0) {
          nonZeroA++;
          sumX += x;
          sumY += y;

          const rq = r >>> 4, gq = g >>> 4, bq = b >>> 4;
          const bucket = (rq << 8) | (gq << 4) | bq;
          if (!seen[bucket]) {
            seen[bucket] = 1;
            uniqueColorCount++;
          }
        }

        // edge-like (very cheap)
        if (x + 1 < w) {
          const da = Math.abs(a - alphaAt(x + 1, y));
          if (da > 32) edgeLike++;
        }
        if (y + 1 < h) {
          const da = Math.abs(a - alphaAt(x, y + 1));
          if (da > 32) edgeLike++;
        }
      }
    }

    const total = w * h;
    const coverage = total ? (nonZeroA / total) : 0;

    // center-of-mass in [0..1]
    const cx = nonZeroA ? (sumX / nonZeroA) / (w - 1) : 0;
    const cy = nonZeroA ? (sumY / nonZeroA) / (h - 1) : 0;

    return {
      nonZeroA,
      coverage,
      cx,
      cy,
      edgeLike,
      uniqueColorCount
    };
  }

  function readTextMetrics(ctx, text) {
    // Some properties may be undefined in some browsers
    const m = ctx.measureText(text);
    return {
      width: m.width || 0,
      abLeft: m.actualBoundingBoxLeft || 0,
      abRight: m.actualBoundingBoxRight || 0,
      abAscent: m.actualBoundingBoxAscent || 0,
      abDescent: m.actualBoundingBoxDescent || 0,
      fbAscent: m.fontBoundingBoxAscent || 0,
      fbDescent: m.fontBoundingBoxDescent || 0,
      emAscent: m.emHeightAscent || 0,
      emDescent: m.emHeightDescent || 0
    };
  }

  try {
    const dpr = (typeof devicePixelRatio === "number" && devicePixelRatio > 0) ? devicePixelRatio : 1;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { stableHash: "no-context", stable: null, timing: null };

    // DPR-normalized canvas: set physical pixels, draw in CSS pixel coords
    const w = Math.round(cfg.sizeCssPx * dpr);
    const h = Math.round(cfg.sizeCssPx * dpr);
    canvas.width = w;
    canvas.height = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Stable feature bytes buffer
    const bytes = [];

    // Per-emoji detailed metrics
    const emojiMetrics = [];

    // Aggregates for summary stats
    let totalCoverage = 0;
    let totalUniqueColors = 0;
    let totalWidth = 0;
    let totalEdgeLike = 0;
    let totalNonZeroA = 0;

    // Optional timing info
    const timing = cfg.includeTiming ? { perEmojiMs: [], totalMs: 0 } : null;
    const t0 = cfg.includeTiming ? performance.now() : 0;

    // Shared draw settings
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";

    // We deliberately use emoji-capable stack; keep it stable across tests
    ctx.font = `${cfg.glyphPx}px ${cfg.emojiFontStack}`;

    for (const cps of cfg.emojiCodepoints) {
      const emoji = String.fromCodePoint.apply(null, cps);

      const tStart = cfg.includeTiming ? performance.now() : 0;

      // Clear
      ctx.clearRect(0, 0, cfg.sizeCssPx, cfg.sizeCssPx);

      // Draw at a consistent anchor
      ctx.fillText(emoji, 6, cfg.sizeCssPx - 10);

      // Metrics (stable-ish)
      const tm = readTextMetrics(ctx, emoji);

      // Read pixels
      const img = ctx.getImageData(0, 0, w, h);

      // Spatial hash + bitmap stats
      const dh = computeAlphaDHash(img, w, h, cfg.sampleGrid);
      const st = computeBitmapStats(img, w, h);

      // Collect per-emoji metrics
      emojiMetrics.push({
        emoji,
        codepoints: cps,
        textMetrics: {
          width: tm.width,
          actualBoundingBox: {
            left: tm.abLeft,
            right: tm.abRight,
            ascent: tm.abAscent,
            descent: tm.abDescent
          },
          fontBoundingBox: {
            ascent: tm.fbAscent,
            descent: tm.fbDescent
          }
        },
        bitmapStats: {
          filledPixels: st.nonZeroA,
          coverage: st.coverage,
          centerOfMass: { x: st.cx, y: st.cy },
          edgeLikeCount: st.edgeLike,
          uniqueColors: st.uniqueColorCount
        },
        dHash: {
          lo: dh.bitsLo,
          hi: dh.bitsHi,
          hex: (dh.bitsHi ? dh.bitsHi.toString(16).padStart(8, '0') : '') + dh.bitsLo.toString(16).padStart(8, '0')
        }
      });

      // Accumulate for aggregates
      totalCoverage += st.coverage;
      totalUniqueColors += st.uniqueColorCount;
      totalWidth += tm.width;
      totalEdgeLike += st.edgeLike;
      totalNonZeroA += st.nonZeroA;

      // Append features to byte buffer (quantized)
      // text metrics (quantize floats)
      pushI16(bytes, quantizeFloat(tm.width, 10));
      pushI16(bytes, quantizeFloat(tm.abLeft, 10));
      pushI16(bytes, quantizeFloat(tm.abRight, 10));
      pushI16(bytes, quantizeFloat(tm.abAscent, 10));
      pushI16(bytes, quantizeFloat(tm.abDescent, 10));
      pushI16(bytes, quantizeFloat(tm.fbAscent, 10));
      pushI16(bytes, quantizeFloat(tm.fbDescent, 10));
      pushI16(bytes, quantizeFloat(tm.emAscent, 10));
      pushI16(bytes, quantizeFloat(tm.emDescent, 10));

      // bitmap stats
      pushU32(bytes, u32(st.nonZeroA));
      pushI16(bytes, quantizeFloat(st.coverage, 10000));
      pushI16(bytes, quantizeFloat(st.cx, 10000));
      pushI16(bytes, quantizeFloat(st.cy, 10000));
      pushU32(bytes, u32(st.edgeLike));
      pushU32(bytes, u32(st.uniqueColorCount));

      // dHash bits
      pushU32(bytes, dh.bitsLo);
      pushU32(bytes, dh.bitsHi);

      if (cfg.includeTiming) timing.perEmojiMs.push(performance.now() - tStart);
    }

    const emojiCount = cfg.emojiCodepoints.length;
    const stableU32 = fnv1a32(bytes);
    const stableHash = ("00000000" + stableU32.toString(16)).slice(-8);

    // Compute aggregates
    const aggregates = {
      avgCoverage: emojiCount ? totalCoverage / emojiCount : 0,
      avgWidth: emojiCount ? totalWidth / emojiCount : 0,
      avgEdgeLike: emojiCount ? totalEdgeLike / emojiCount : 0,
      totalUniqueColors,
      totalFilledPixels: totalNonZeroA
    };

    if (cfg.includeTiming) timing.totalMs = performance.now() - t0;

    return {
      stableHash,
      stable: {
        dpr,
        sizeCssPx: cfg.sizeCssPx,
        glyphPx: cfg.glyphPx,
        sampleGrid: cfg.sampleGrid,
        emojiCount
      },
      emojiMetrics,
      aggregates,
      timing
    };
  } catch (e) {
    return { stableHash: "error", stable: null, timing: null };
  }
}

export { getEmojiFingerprint };
export default getEmojiFingerprint;