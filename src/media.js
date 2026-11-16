// Runs media.ps1 as a long-lived child and turns its JSON lines into events.
const { spawn } = require("node:child_process");
const path = require("node:path");

/** Friendly names for the apps people actually play music in. @param {string} id */
function appName(id) {
  const s = (id ?? "").toLowerCase();
  const known = [
    ["spotify", "Spotify"],
    ["applemusic", "Apple Music"],
    ["zunemusic", "Media Player"],
    ["chrome", "Chrome"],
    ["msedge", "Edge"],
    ["308046b0af4a39cb", "Firefox"],
    ["firefox", "Firefox"],
    ["brave", "Brave"],
    ["opera", "Opera"],
    ["vivaldi", "Vivaldi"],
    ["arc", "Arc"],
    ["tidal", "TIDAL"],
    ["deezer", "Deezer"],
    ["amazonmusic", "Amazon Music"],
    ["youtube", "YouTube Music"],
    ["vlc", "VLC"],
    ["foobar", "foobar2000"],
    ["musicbee", "MusicBee"],
    ["aimp", "AIMP"],
    ["itunes", "iTunes"],
  ];
  const hit = known.find(([k]) => s.includes(/** @type {string} */ (k)));
  if (hit) return /** @type {string} */ (hit[1]);
  const base =
    s
      .split("!")
      .pop()
      ?.replace(/\.exe$/, "") ?? "";
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Music";
}

/**
 * Normalise a raw state line. Stopped or closed sessions count as nothing playing.
 * @param {any} raw
 */
function normalise(raw) {
  if (!raw || raw.type !== "state" || !raw.title || ["Closed", "Stopped"].includes(raw.status)) return null;
  return {
    app: appName(raw.app),
    title: String(raw.title),
    artist: String(raw.artist ?? ""),
    album: String(raw.album ?? ""),
    playing: raw.status === "Playing",
    position: Math.max(0, Number(raw.position) || 0),
    duration: Math.max(0, Number(raw.duration) || 0),
    updated: Number(raw.updated) || Date.now(),
    canPrev: Boolean(raw.canPrev),
    canNext: Boolean(raw.canNext),
    canSeek: Boolean(raw.canSeek),
  };
}

/** Same track? Used to fetch lyrics and art once per song. @param {any} a @param {any} b */
const sameTrack = (a, b) => Boolean(a && b && a.title === b.title && a.artist === b.artist && a.app === b.app);

/**
 * @param {{ onState: (s: ReturnType<typeof normalise>) => void, onArt: (a: { key: string, src: string | null }) => void, log: (...a: any[]) => void }} h
 */
function start(h) {
  // asar can't be executed from; electron-builder unpacks the script next to it
  const script = path.join(__dirname, "media.ps1").replace("app.asar", "app.asar.unpacked");
  /** @type {import("node:child_process").ChildProcessWithoutNullStreams | null} */
  let child = null;
  let stopped = false;
  let backoff = 1000;

  function run() {
    const c = spawn(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script],
      { windowsHide: true },
    );
    child = c;
    let buf = "";
    c.stdout.setEncoding("utf8");
    c.stdout.on("data", (chunk) => {
      buf += chunk;
      let nl = buf.indexOf("\n");
      while (nl >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        nl = buf.indexOf("\n");
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          backoff = 1000;
          if (msg.type === "art") h.onArt({ key: msg.key, src: msg.src ?? null });
          else if (msg.type === "error") h.log("warn", "media", msg.message);
          else h.onState(normalise(msg));
        } catch {
          h.log("warn", "media: bad line", line.slice(0, 200));
        }
      }
    });
    c.stderr.on("data", (d) => h.log("warn", "media stderr", String(d).slice(0, 400)));
    c.on("exit", (code) => {
      if (child === c) child = null;
      if (stopped) return;
      h.log("warn", "media bridge exited", code);
      h.onState(null);
      setTimeout(run, backoff);
      backoff = Math.min(backoff * 2, 30000);
    });
  }
  run();

  return {
    /** @param {string} cmd */
    send(cmd) {
      if (child?.stdin.writable) child.stdin.write(`${cmd}\n`);
    },
    stop() {
      stopped = true;
      if (child?.stdin.writable) child.stdin.write("quit\n");
      setTimeout(() => child?.kill(), 500);
    },
  };
}

module.exports = { start, appName, normalise, sameTrack };
