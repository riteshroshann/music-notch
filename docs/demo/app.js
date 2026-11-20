// Wires the now-playing feed, controls, lyrics and the aurora to the island.
/* global Motion, Sound, Ears, Aurora, Pet */
const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const params = new URLSearchParams(location.search);

/** @typedef {{ app: string, title: string, artist: string, album: string, playing: boolean, position: number, duration: number, updated: number, canPrev: boolean, canNext: boolean, canSeek: boolean }} Now */
/** @typedef {{ t: number, text: string }} Line */

// ---------- demo feed ----------
// The website and screenshots run without Electron: three made-up songs with painted covers,
// their own lyrics, and controls that really skip and seek.

function demoBridge() {
  /** @type {Record<string, (v: any) => void>} */
  const handlers = {};
  const cover = (/** @type {string[]} */ stops, /** @type {string} */ sun) => {
    const c = document.createElement("canvas");
    c.width = c.height = 240;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
    const grad = g.createLinearGradient(0, 0, 240, 240);
    stops.forEach((s, i) => grad.addColorStop(i / (stops.length - 1), s));
    g.fillStyle = grad;
    g.fillRect(0, 0, 240, 240);
    const glow = g.createRadialGradient(150, 96, 4, 150, 96, 120);
    glow.addColorStop(0, sun);
    glow.addColorStop(1, "transparent");
    g.fillStyle = glow;
    g.fillRect(0, 0, 240, 240);
    g.fillStyle = "rgba(0,0,0,.28)";
    for (let i = 0; i < 6; i++) g.fillRect(0, 168 + i * 13, 240, 5 - i * 0.6);
    return c.toDataURL("image/jpeg", 0.9);
  };
  const songs = [
    {
      title: "where the light pools",
      artist: "Saffron Hours, Low Tide Club",
      album: "Late Bloom",
      duration: 163000,
      art: () => cover(["#f6b73c", "#e2702a", "#5b1f12"], "rgba(255,240,190,.95)"),
      words: [
        "",
        "golden hour on the kitchen floor",
        "you said stay a little more",
        "light pools where your shadow was",
        "and I'm humming just because",
        "",
        "where the light pools, I'll be there",
        "sunlight caught up in your hair",
      ],
    },
    {
      title: "it hums in blue",
      artist: "Night Index, Mareo",
      album: "Signal",
      duration: 126000,
      art: () => cover(["#0a1b3f", "#1f5fd1", "#7cc6ff"], "rgba(190,230,255,.9)"),
      words: [
        "",
        "static on the window glass",
        "city lights that never pass",
        "it hums in blue, it hums in blue",
        "every signal leads to you",
      ],
    },
    {
      title: "velvet satellites",
      artist: "Ana Mirelle",
      album: "Orbit Songs",
      duration: 201000,
      art: () => cover(["#2a0838", "#b0249b", "#ff7ab8"], "rgba(255,200,240,.9)"),
      words: ["", "we were velvet satellites", "falling slow through neon nights", "hold the line and hold it tight"],
    },
  ];
  let i = 0;
  let playing = true;
  let position = 11000;
  let updated = Date.now();
  const emit = () => {
    const s = /** @type {(typeof songs)[number]} */ (songs[i]);
    handlers.media?.({
      app: "Spotify",
      title: s.title,
      artist: s.artist,
      album: s.album,
      playing,
      position,
      duration: s.duration,
      updated,
      canPrev: true,
      canNext: true,
      canSeek: true,
    });
  };
  const load = () => {
    const s = /** @type {(typeof songs)[number]} */ (songs[i]);
    handlers.art?.({ key: s.title, src: s.art() });
    handlers.lyrics?.({
      key: `${s.title}\u0000${s.artist}`,
      lines: s.words.map((text, k) => ({ t: k * 4200, text })),
      plain: null,
    });
  };
  const now = () => position + (playing ? Date.now() - updated : 0);
  setTimeout(() => {
    emit();
    load();
  }, 60);
  setInterval(() => {
    if (now() >= /** @type {(typeof songs)[number]} */ (songs[i]).duration) skip(1);
  }, 500);
  /** @param {number} d */
  function skip(d) {
    i = (i + d + songs.length) % songs.length;
    position = 0;
    updated = Date.now();
    emit();
    load();
  }
  return {
    demo: true,
    init: async () => ({ settings: { sound: true, lyrics: true, aurora: true }, now: null, art: null }),
    hover() {},
    menu() {},
    quit() {},
    /** @param {string} cmd @param {number} [v] */
    control(cmd, v) {
      if (cmd === "toggle") {
        position = now();
        updated = Date.now();
        playing = !playing;
        emit();
      } else if (cmd === "next") skip(1);
      else if (cmd === "prev" && now() > 3000) {
        position = 0;
        updated = Date.now();
        emit();
      } else if (cmd === "prev") skip(-1);
      else if (cmd === "seek" && v !== undefined) {
        position = v;
        updated = Date.now();
        emit();
      }
    },
    on: (/** @type {string} */ c, /** @type {(v: any) => void} */ f) => (handlers[c] = f),
  };
}

const bridge =
  /** @type {any} */ (window).notch && (!params.has("shot") || params.has("live"))
    ? /** @type {any} */ (window).notch
    : demoBridge();

// ---------- state ----------
const island = $("np");
const shell = $("shell");
/** @type {Now | null} */
let now = null;
/** @type {Line[] | null} */
let lines = null;
let lyricKey = "";
let lineIdx = -2;
let isOpen = false;
let settings = { sound: true, lyrics: true, aurora: true };
/** @type {number | null} */
let dragRatio = null;

const fmtTime = (/** @type {number} */ ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const keyOf = (/** @type {Now} */ s) => `${s.title}\u0000${s.artist}`;

/** Where the song is right now, counting time since the player last reported. */
function position() {
  if (!now) return 0;
  const p = now.position + (now.playing ? Date.now() - now.updated : 0);
  return now.duration ? Math.min(now.duration, p) : p;
}

/** @param {boolean} open */
function setOpen(open) {
  if (open && !now) return;
  if (open === isOpen) return;
  isOpen = open;
  Motion.morph(island, open);
  shell.classList.toggle("open", open);
  island.setAttribute("aria-expanded", String(open));
  Sound.play(open ? "open" : "close");
  if (open) island.focus();
}

island.addEventListener("click", (e) => {
  if (/** @type {HTMLElement} */ (e.target).closest(".ctl, .track, .round")) return;
  if (!isOpen) setOpen(true);
});
$("quit").addEventListener("click", () => {
  Sound.play("close");
  setTimeout(() => bridge.quit(), 220);
});

// ---------- controls ----------
/** @param {string} cmd */
function control(cmd) {
  if (!now) return;
  if (cmd === "toggle") {
    // answer instantly; the player's own report follows a moment later
    now = { ...now, position: position(), updated: Date.now(), playing: !now.playing };
    island.classList.toggle("playing", now.playing);
    $("play").setAttribute("aria-label", now.playing ? "Pause" : "Play");
  }
  Sound.play("page");
  bridge.control(cmd);
}
$("play").addEventListener("click", () => control("toggle"));
$("prev").addEventListener("click", () => control("prev"));
$("next").addEventListener("click", () => control("next"));

for (const el of /** @type {HTMLElement[]} */ ([...document.querySelectorAll("[role=button]")])) {
  el.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target === el) {
      e.preventDefault();
      e.stopPropagation();
      el.click();
    }
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") return setOpen(false);
  if (!isOpen || e.target !== island) return;
  if (e.key === " ") control("toggle");
  else if (e.key === "ArrowRight") control("next");
  else if (e.key === "ArrowLeft") control("prev");
  else return;
  e.preventDefault();
});

$("lyricsBtn").addEventListener("click", () => {
  settings.lyrics = !settings.lyrics;
  $("lyricsBtn").setAttribute("aria-pressed", String(settings.lyrics));
  lineIdx = -2;
  Sound.play("page");
});

// ---------- seeking ----------
const track = $("track");
/** @param {PointerEvent} e */
const ratioAt = (e) => {
  const r = track.getBoundingClientRect();
  return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
};
track.addEventListener("pointerdown", (e) => {
  if (!now?.canSeek || !now.duration) return;
  track.setPointerCapture(e.pointerId);
  track.classList.add("drag");
  dragRatio = ratioAt(e);
});
track.addEventListener("pointermove", (e) => {
  if (dragRatio !== null) dragRatio = ratioAt(e);
});
const endDrag = () => {
  if (dragRatio === null || !now) return;
  const ms = dragRatio * now.duration;
  now = { ...now, position: ms, updated: Date.now() };
  dragRatio = null;
  track.classList.remove("drag");
  bridge.control("seek", ms);
  lineIdx = -2;
};
track.addEventListener("pointerup", endDrag);
track.addEventListener("pointercancel", endDrag);
track.addEventListener("keydown", (e) => {
  if (!now?.canSeek || !now.duration) return;
  const step = { ArrowRight: 5000, ArrowLeft: -5000 }[e.key];
  if (!step) return;
  e.preventDefault();
  e.stopPropagation();
  const ms = Math.min(now.duration, Math.max(0, position() + step));
  now = { ...now, position: ms, updated: Date.now() };
  bridge.control("seek", ms);
});

// ---------- hover, press, click-through ----------
island.addEventListener("pointerenter", () => {
  if (!isOpen) {
    Motion.press(shell, 1.035);
    Motion.jelly(island, 0.7);
    Sound.play("hover");
  }
});
island.addEventListener("pointerleave", () => Motion.press(shell, 1));
island.addEventListener("pointerdown", () => {
  if (isOpen) return;
  Motion.press(shell, 0.97);
  Pet.mood("happy", 450);
});
island.addEventListener("pointerup", () => Motion.press(shell, 1));
document.addEventListener("pointermove", (e) => {
  bridge.hover(Boolean(/** @type {HTMLElement} */ (e.target).closest(".island")));
});
document.addEventListener("pointerleave", () => bridge.hover(false));
bridge.on("cursor", (/** @type {{ x: number, y: number }} */ c) => Pet.look(c.x, c.y));
document.addEventListener("pointermove", (e) => Pet.look(e.clientX, e.clientY));
// the website passes the page cursor in, so the demo pet watches you anywhere on the page
addEventListener("message", (e) => {
  const c = e.origin === location.origin ? e.data?.cursor : null;
  if (Array.isArray(c)) Pet.look(c[0], c[1]);
});
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (/** @type {HTMLElement} */ (e.target).closest(".island")) bridge.menu();
});
bridge.on("collapse", () => setOpen(false));
bridge.on("open", () => setOpen(true));

// ---------- feed ----------
/** @param {Now | null} s */
function render(s) {
  const prev = now;
  now = s;
  document.body.classList.toggle("idle", !s);
  shell.classList.toggle("idle", !s);
  if (!s) {
    setOpen(false);
    return;
  }
  if (!prev && !params.has("shot")) Motion.intro([shell]);
  if (prev && keyOf(prev) !== keyOf(s)) {
    Pet.mood("wow", 900);
    Motion.jelly(island, 0.6);
    Motion.pop([$("artLg"), $("title"), $("artist")]);
  }
  island.classList.toggle("playing", s.playing);
  $("play").setAttribute("aria-label", s.playing ? "Pause" : "Play");
  $("title").textContent = s.title;
  $("artist").textContent = s.artist || s.album || s.app;
  island.setAttribute("aria-label", `Now playing: ${s.title}${s.artist ? ` by ${s.artist}` : ""}`);
  $("prev").classList.toggle("off", !s.canPrev);
  $("next").classList.toggle("off", !s.canNext);
  for (const id of ["back10", "fwd10"]) $(id).classList.toggle("off", !s.canSeek || !s.duration);
  track.classList.toggle("locked", !s.canSeek);
  $("tEnd").textContent = fmtTime(s.duration);
  island.querySelector(".progress")?.classList.toggle("none", !s.duration);
  if (!prev || keyOf(prev) !== keyOf(s)) {
    if (lyricKey !== keyOf(s)) lines = null;
    lineIdx = -2;
  }
}
bridge.on("media", render);

/** @param {{ key: string, src: string | null }} a */
function setArt(a) {
  const css = a.src ? `url("${a.src.replace(/"/g, "%22")}")` : "";
  $("artLg").style.backgroundImage = css;
  $("artLg").style.setProperty("--cover", css || "none");
  Aurora.paletteFrom(a.src);
}
bridge.on("art", setArt);

bridge.on("lyrics", (/** @type {{ key: string, lines: Line[] | null }} */ l) => {
  lyricKey = l.key;
  lines = l.lines?.length ? l.lines : null;
  lineIdx = -2;
});

bridge.on("settings", (/** @type {typeof settings} */ s) => applySettings(s));

/** @param {typeof settings} s */
function applySettings(s) {
  settings = { ...s };
  Sound.setEnabled(s.sound);
  $("lyricsBtn").setAttribute("aria-pressed", String(s.lyrics));
  document.body.classList.toggle("no-aurora", !s.aurora);
  if (s.aurora && !bridge.demo)
    Ears.listen().then((ok) => {
      Ears.setFake(!ok);
      if (params.has("live")) document.title = `loopback:${ok}`;
    });
  if (!s.aurora) Ears.stop();
  lineIdx = -2;
}

// ---------- lyrics ----------

/** @param {Line[]} ls @param {number} ms */
function lineAt(ls, ms) {
  let lo = 0;
  let hi = ls.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (/** @type {Line} */ (ls[mid]).t <= ms) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** The open player shows the line being sung and the next one; the chip stays a face. */
function updateLines() {
  if (!now) return;
  const synced = settings.lyrics && lines && lyricKey === keyOf(now) ? lines : null;
  const idx = synced ? lineAt(synced, position() + 250) : -1;
  if (idx === lineIdx) return;
  const first = lineIdx === -2;
  lineIdx = idx;
  const cur = synced?.[idx]?.text ?? "";
  const nxt = synced?.slice(idx + 1).find((l) => l.text)?.text ?? "";

  const box = $("lyrics");
  const show = () => {
    box.classList.toggle("plain", !synced);
    if (synced) {
      $("lyNow").textContent = cur || "♪";
      $("lyNext").textContent = nxt;
    } else {
      $("lyNow").textContent = now?.album ? `${now.album}` : "";
      $("lyNext").textContent = now ? `Playing in ${now.app}` : "";
    }
  };
  if (first) return show();
  // old line drifts up and out, the new one rises in from below
  box.classList.add("out");
  setTimeout(() => {
    show();
    box.classList.remove("out");
    box.classList.add("in");
    box.getBoundingClientRect();
    box.classList.remove("in");
  }, 190);
  if (cur) Aurora.wave();
}

// ---------- frame loop ----------
const bloom = /** @type {HTMLCanvasElement} */ ($("bloom"));
let openLevel = 0;
let lastAccent = "";

/** @param {number} t */
function frame(t) {
  requestAnimationFrame(frame);
  if (!now) return;
  const playing = now.playing;
  const ears = Ears.read(t, playing && settings.aurora);
  openLevel += ((isOpen ? 1 : 0) - openLevel) * 0.12;
  Aurora.blend();

  if (settings.aurora || isOpen) Aurora.bloom(bloom, ears, t, openLevel);
  Pet.tick(t, ears, playing);

  const c = /** @type {number[]} */ (Aurora.colours()[0]);
  const accent = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  if (accent !== lastAccent) {
    document.documentElement.style.setProperty("--accent", accent);
    lastAccent = accent;
  }
  const p = dragRatio !== null && now.duration ? dragRatio * now.duration : position();
  if (isOpen && now.duration) {
    track.style.setProperty("--p", (p / now.duration).toFixed(4));
    track.style.setProperty("--glow", (playing ? Math.min(1, ears.beat * 0.8 + ears.bass * 0.6) : 0).toFixed(3));
    track.setAttribute("aria-valuenow", String(Math.round((p / now.duration) * 100)));
    const txt = fmtTime(p);
    if ($("tNow").textContent !== txt) $("tNow").textContent = txt;
  }
  updateLines();
}

// ---------- boot ----------
bridge.init().then((/** @type {{ settings: typeof settings, now: Now | null, art: any }} */ s) => {
  applySettings(s.settings);
  if (bridge.demo) Ears.setFake(true);
  if (s.now) render(s.now);
  if (s.art) setArt(s.art);
  if (params.has("shot")) setTimeout(() => params.get("shot") === "1" && setOpen(true), 700);
});
requestAnimationFrame(frame);

if (params.has("shot")) document.body.style.background = "linear-gradient(#26262b, #0f0f12)";
if (params.has("demo")) {
  document.body.classList.add("demo");
  // say hi as the pet first, then open up so visitors see the player
  setTimeout(() => !isOpen && setOpen(true), 2200);
}

/** Titles and lyrics come from other apps and the network; keep them as text. @param {string} s */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/** Jump within the song, answering on screen at once. @param {number} ms */
function jump(ms) {
  if (!now?.canSeek || !now.duration) return;
  const to = Math.min(now.duration, Math.max(0, position() + ms));
  now = { ...now, position: to, updated: Date.now() };
  lineIdx = -2;
  Sound.play("page");
  bridge.control("seek", to);
}
$("back10").addEventListener("click", () => jump(-10000));
$("fwd10").addEventListener("click", () => jump(10000));
