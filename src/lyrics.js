// Synced lyrics from LRCLIB (lrclib.net), a free, open lyrics database. Only the track's
// title, artist, album and length are sent. Parsing and lookup are pure and tested.

const API = "https://lrclib.net/api";
const UA = "Music Notch (https://github.com/riteshroshann/music-notch)";

/** @typedef {{ t: number, text: string }} Line */

/**
 * LRC text into time-ordered lines. Handles several stamps per line and an [offset:] tag.
 * @param {string} lrc @returns {Line[]}
 */
function parseLrc(lrc) {
  const offset = Number(/\[offset:\s*([+-]?\d+)\s*\]/i.exec(lrc)?.[1] ?? 0);
  /** @type {Line[]} */
  const out = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const text = raw
      .slice(stamps.at(-1)?.index ?? 0)
      .replace(/^\[[^\]]*\]/, "")
      .trim();
    for (const m of stamps) {
      const frac = m[3] ? Number(m[3].padEnd(3, "0")) : 0;
      out.push({ t: Math.max(0, Number(m[1]) * 60000 + Number(m[2]) * 1000 + frac - offset), text });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * Index of the line being sung at `ms`, or -1 before the first.
 * @param {Line[]} lines @param {number} ms
 */
function lineAt(lines, ms) {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (/** @type {Line} */ (lines[mid]).t <= ms) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Strip what stores add to titles: "(Remastered 2011)", "- Radio Edit", "(feat. X)". @param {string} s */
function cleanTitle(s) {
  return s
    .replace(/\s*[([](?:feat\.?|ft\.?|with)\s[^)\]]*[)\]]/gi, "")
    .replace(/\s*[([][^)\]]*(?:remaster|version|edit|live|mono|stereo|mix)[^)\]]*[)\]]/gi, "")
    .replace(/\s+-\s+.*(?:remaster|version|edit|live|mono|stereo|mix).*$/i, "")
    .trim();
}

/** First listed artist: "88rising, yung kai, sunkis" → "88rising". @param {string} s */
const firstArtist = (s) => s.split(/\s*(?:,|&|;| x | feat\.? | ft\.? )\s*/i)[0]?.trim() ?? s;

/**
 * Best search hit: synced first, then closest in length.
 * @param {any[]} hits @param {number} durationS
 */
function pick(hits, durationS) {
  const scored = hits
    .filter((h) => h && (h.syncedLyrics || h.plainLyrics))
    .map((h) => ({ h, d: durationS ? Math.abs((h.duration ?? 0) - durationS) : 0 }))
    .filter((x) => !durationS || x.d < 8);
  scored.sort((a, b) => Number(Boolean(b.h.syncedLyrics)) - Number(Boolean(a.h.syncedLyrics)) || a.d - b.d);
  return scored[0]?.h ?? null;
}

/** @param {string} url */
async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`lrclib ${r.status}`);
  return r.json();
}

/**
 * @param {{ title: string, artist: string, album?: string, duration?: number }} track duration in ms
 * @returns {Promise<{ lines: Line[] | null, plain: string | null }>}
 */
async function fetchLyrics(track) {
  const title = cleanTitle(track.title);
  const artist = firstArtist(track.artist);
  const durationS = Math.round((track.duration ?? 0) / 1000);
  const q = new URLSearchParams({ track_name: title, artist_name: artist });
  if (track.album) q.set("album_name", track.album);
  if (durationS) q.set("duration", String(durationS));
  let hit = await get(`${API}/get?${q}`).catch(() => null);
  if (!hit?.syncedLyrics) {
    const found = await get(`${API}/search?${new URLSearchParams({ track_name: title, artist_name: artist })}`);
    hit = pick(Array.isArray(found) ? found : [], durationS) ?? hit;
  }
  if (!hit || hit.instrumental) return { lines: null, plain: null };
  return { lines: hit.syncedLyrics ? parseLrc(hit.syncedLyrics) : null, plain: hit.plainLyrics ?? null };
}

module.exports = { parseLrc, lineAt, cleanTitle, firstArtist, pick, fetchLyrics };
