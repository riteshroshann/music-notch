// The aurora, drawn inside the island only: light rising from the bottom edge in the cover's
// colours, with curtains of rays that grow with the music.
// Colours come from the cover art; sizes and brightness come from Ears; lyric lines send a wave.
const Aurora = (() => {
  /** @typedef {[number, number, number]} RGB */
  /** @type {RGB[]} */
  const DEFAULT = [
    [62, 242, 176],
    [79, 195, 232],
    [139, 92, 246],
  ];
  /** @type {RGB[]} */
  let target = DEFAULT.map((c) => [...c]);
  /** @type {RGB[]} */
  const colour = DEFAULT.map((c) => /** @type {RGB} */ ([...c]));
  let waveAt = -1e9;

  /** Drift the live colours toward the target so a new song washes in. */
  function blend() {
    for (let i = 0; i < 3; i++)
      for (let k = 0; k < 3; k++) {
        const c = /** @type {RGB} */ (colour[i]);
        c[k] += /** @type {RGB} */ (target[i][k] - c[k]) * 0.04;
      }
  }
  const rgba = (/** @type {RGB} */ c, /** @type {number} */ a) =>
    `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

  /** @param {number} r8 @param {number} g8 @param {number} b8 */
  function hsl(r8, g8, b8) {
    const r = r8 / 255;
    const g = g8 / 255;
    const b = b8 / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
  }
  /** @param {number} h @param {number} s @param {number} l @returns {RGB} */
  function rgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] =
      h < 60
        ? [c, x, 0]
        : h < 120
          ? [x, c, 0]
          : h < 180
            ? [0, c, x]
            : h < 240
              ? [0, x, c]
              : h < 300
                ? [x, 0, c]
                : [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }

  /**
   * Three vivid colours from a cover: hues weighted by how saturated and bright they are.
   * Grey or near-black covers keep the default aurora.
   * @param {string | null} src
   */
  function paletteFrom(src) {
    if (!src) {
      target = DEFAULT.map((c) => [...c]);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const n = 36;
      const cv = document.createElement("canvas");
      cv.width = cv.height = n;
      const g = cv.getContext("2d", { willReadFrequently: true });
      if (!g) return;
      g.drawImage(img, 0, 0, n, n);
      const px = g.getImageData(0, 0, n, n).data;
      /** @type {{ w: number, h: number, s: number, l: number }[]} */
      const buckets = Array.from({ length: 18 }, () => ({ w: 0, h: 0, s: 0, l: 0 }));
      for (let i = 0; i < px.length; i += 4) {
        const [h, s, l] = hsl(
          /** @type {number} */ (px[i]),
          /** @type {number} */ (px[i + 1]),
          /** @type {number} */ (px[i + 2]),
        );
        if (l < 0.12 || l > 0.94 || s < 0.18) continue;
        const b = /** @type {{ w: number, h: number, s: number, l: number }} */ (buckets[Math.floor(h / 20) % 18]);
        const w = s * (1 - Math.abs(l - 0.55));
        b.w += w;
        b.h += h * w;
        b.s += s * w;
        b.l += l * w;
      }
      const ranked = buckets.filter((b) => b.w > 1.2).sort((a, b) => b.w - a.w);
      if (!ranked.length) return void (target = DEFAULT.map((c) => [...c]));
      /** @type {RGB[]} */
      const picks = ranked
        .slice(0, 3)
        .map((b) => rgb(b.h / b.w, Math.max(0.65, b.s / b.w), Math.min(0.62, Math.max(0.5, b.l / b.w))));
      // one strong hue: fan it out into neighbours so the aurora still has depth
      const [h0] = hsl(.../** @type {RGB} */ (picks[0]));
      while (picks.length < 3) picks.push(rgb((h0 + (picks.length === 1 ? 28 : -34) + 360) % 360, 0.72, 0.56));
      target = picks;
    };
    img.src = src;
  }

  /** A lyric line just started: send a wave of light along the island. */
  function wave() {
    waveAt = performance.now();
  }

  /** Smooth, wandering 0..1 field across x and time. @param {number} x @param {number} t */
  function field(x, t) {
    return (
      0.5 +
      0.22 * Math.sin(x * 0.011 + t * 0.00062) +
      0.13 * Math.sin(x * 0.027 - t * 0.0011 + 1.7) +
      0.08 * Math.sin(x * 0.061 + t * 0.0019 + 0.4)
    );
  }

  /** Fine vertical striations, the rays that make a curtain read as aurora. @param {number} x @param {number} t */
  function rays(x, t) {
    const r = Math.sin(x * 0.21 + t * 0.0024) * Math.sin(x * 0.083 - t * 0.0013 + 2.1);
    return 0.45 + 0.55 * r * r;
  }

  /**
   * Light inside the island, rising from the bottom like the glow behind a lock screen player.
   * @param {HTMLCanvasElement} cv @param {ReturnType<typeof Ears.read>} ears @param {number} t @param {number} level 0 resting .. 1 open
   */
  function bloom(cv, ears, t, level) {
    const g = cv.getContext("2d");
    if (!g) return;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    const dpr = devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    const kick = ears.beat * 0.35 + ears.bass * 0.5;
    const since = t - waveAt;
    const waveX = since < 1400 ? (since / 1400) * (w + 300) - 150 : -1e4;
    const blobs = [
      { c: colour[0], x: 0.5 + 0.22 * Math.sin(t / 3100), y: 1.05, r: 0.75 + 0.35 * kick, a: 0.62 },
      { c: colour[1], x: 0.18 + 0.12 * Math.sin(t / 2300 + 2), y: 0.95, r: 0.5 + 0.3 * ears.mid, a: 0.5 },
      { c: colour[2], x: 0.85 + 0.1 * Math.sin(t / 2700 + 4), y: 1.0, r: 0.55 + 0.3 * ears.high, a: 0.5 },
    ];
    for (const b of blobs) {
      const cx = b.x * w;
      const cy = b.y * h;
      const r = Math.max(w, h) * b.r * (0.75 + 0.25 * level);
      const boost = waveX > -1e3 ? Math.exp(-(((cx - waveX) / 160) ** 2)) * 0.35 : 0;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      const a = (b.a * (0.55 + 0.45 * level) + ears.energy * 0.4 + boost) * (0.4 + 0.6 * level);
      grad.addColorStop(0, rgba(/** @type {RGB} */ (b.c), a));
      grad.addColorStop(0.45, rgba(/** @type {RGB} */ (b.c), a * 0.38));
      grad.addColorStop(1, rgba(/** @type {RGB} */ (b.c), 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }

    // curtains rising from the bottom edge, tallest where the music is loudest
    const loud = 0.3 + ears.energy * 1.3 + ears.beat * 0.4;
    const step = 3;
    g.filter = "blur(5px)";
    for (let x = -6; x <= w + 6; x += step) {
      const n = field(x, t) * rays(x, t);
      const band = ears.bands[Math.min(4, Math.max(0, Math.floor((x / w) * 5)))] ?? 0;
      const wv = waveX > -1e3 ? Math.exp(-(((x - waveX) / 60) ** 2)) : 0;
      const len = h * (0.18 + 0.5 * n * loud + 0.35 * band + 0.3 * wv) * (0.6 + 0.4 * level);
      const c = /** @type {RGB} */ (colour[Math.floor(((x * 0.004 + t * 0.00007) % 3) + 3) % 3]);
      const a = (0.08 + 0.38 * n * loud + 0.3 * wv) * (0.45 + 0.55 * level);
      const grad = g.createLinearGradient(0, h, 0, h - len);
      grad.addColorStop(0, rgba(c, a));
      grad.addColorStop(1, rgba(c, 0));
      g.fillStyle = grad;
      g.fillRect(x, h - len, step + 1, len);
    }
    g.filter = "none";
  }

  return { paletteFrom, wave, bloom, blend, colours: () => colour };
})();
