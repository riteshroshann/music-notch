const { app, BrowserWindow, Menu, Tray, desktopCapturer, ipcMain, nativeImage, screen, session, shell } =
  require("electron");
const fs = require("node:fs");
const path = require("node:path");
const media = require("./media.js");
const { fetchLyrics } = require("./lyrics.js");
const pkg = require("../package.json");

// Wide and tall enough for the open island plus the aurora spilling out around it.
const WIDTH = 820;
const HEIGHT = 340;
const SITE = "https://riteshroshann.github.io/music-notch/";

const arg = (/** @type {string} */ name) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const shotPath = arg("shot");
const rendererDir = arg("renderer") ?? path.join(__dirname, "renderer");
const tooling = Boolean(shotPath);
if (!tooling && !app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

if (arg("profile")) app.setPath("userData", /** @type {string} */ (arg("profile")));
const store = (/** @type {string} */ name) => path.join(app.getPath("userData"), name);

/** @returns {{ sound: boolean, lyrics: boolean, aurora: boolean }} */
function loadSettings() {
  const defaults = { sound: true, lyrics: true, aurora: true };
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(store("settings.json"), "utf8")) };
  } catch {
    return defaults;
  }
}
const firstRun = !fs.existsSync(store("settings.json"));
const settings = loadSettings();
const saveSettings = () => fs.writeFileSync(store("settings.json"), JSON.stringify(settings, null, 2));

// ---------- log ----------
const LOG_MAX = 512 * 1024;

/** @param {"info" | "warn" | "error"} level @param {...unknown} parts */
function log(level, ...parts) {
  try {
    const file = store("main.log");
    if (fs.existsSync(file) && fs.statSync(file).size > LOG_MAX) fs.renameSync(file, store("main.old.log"));
    const text = parts.map((p) => (p instanceof Error ? (p.stack ?? p.message) : String(p))).join(" ");
    fs.appendFileSync(file, `${new Date().toISOString()} ${level} ${text}\n`);
  } catch {
    // logging must never be the thing that breaks the app
  }
}
if (!tooling) {
  process.on("uncaughtException", (e) => log("error", "uncaught", e));
  process.on("unhandledRejection", (e) => log("error", "unhandled rejection", e));
}

// ---------- window ----------

/** @type {BrowserWindow | null} */
let win = null;
/** @type {Tray} */
let tray;
let quitting = false;
app.on("before-quit", () => {
  quitting = true;
});

/** @param {BrowserWindow | null} w @returns {w is BrowserWindow} */
const alive = (w) => w !== null && !w.isDestroyed();

function send(/** @type {string} */ channel, /** @type {any} */ value) {
  if (alive(win)) win.webContents.send(channel, value);
}

const placement = () => {
  const { workArea } = screen.getPrimaryDisplay();
  return { x: Math.round(workArea.x + (workArea.width - WIDTH) / 2), y: workArea.y };
};

function createWindow() {
  const w = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    ...placement(),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), backgroundThrottling: false },
  });
  win = w;
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  w.setAlwaysOnTop(true, "pop-up-menu");
  w.setIgnoreMouseEvents(true, { forward: true });
  w.on("close", (e) => {
    if (!quitting && !tooling) e.preventDefault();
  });
  w.on("session-end", () => {
    quitting = true;
  });
  w.on("closed", () => {
    if (win === w) win = null;
  });
  w.webContents.on("render-process-gone", (_e, details) => {
    log("error", "renderer gone", details.reason);
    if (!quitting && details.reason !== "clean-exit") setTimeout(() => alive(w) && w.reload(), 1000);
  });
  const live = arg("live") ? { live: "1" } : {};
  w.loadFile(path.join(rendererDir, "index.html"), { query: shotPath ? { shot: arg("open") ?? "1", ...live } : {} });
  w.once("ready-to-show", () => w.showInactive());
  w.on("blur", () => !tooling && send("collapse"));
  if (shotPath) {
    w.webContents.once("did-finish-load", () =>
      setTimeout(
        async () => {
          fs.writeFileSync(shotPath, (await w.webContents.capturePage()).toPNG());
          console.log(w.getTitle());
          app.quit();
        },
        Number(arg("wait") ?? 3000),
      ),
    );
  }
}

// ---------- system audio, for the aurora ----------
// The renderer asks for a display stream; we answer with the screen plus Windows' loopback
// audio, and it keeps only the audio. Nothing is recorded: the samples feed an analyser and vanish.

function allowLoopback() {
  session.defaultSession.setDisplayMediaRequestHandler(
    (_req, callback) => {
      desktopCapturer
        .getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } })
        .then((sources) => (sources[0] ? callback({ video: sources[0], audio: "loopback" }) : callback({})))
        .catch((e) => {
          log("warn", "loopback", e);
          callback({});
        });
    },
    { useSystemPicker: false },
  );
}

// ---------- now playing ----------

/** @type {ReturnType<typeof media.normalise>} */
let now = null;
/** @type {{ key: string, src: string | null } | null} */
let art = null;
/** @type {Map<string, Awaited<ReturnType<typeof fetchLyrics>>>} */
const lyricsCache = new Map();
/** @type {ReturnType<typeof media.start> | null} */
let bridge = null;

const trackKey = (/** @type {any} */ s) => `${s.title}\u0000${s.artist}`;

/** @param {NonNullable<typeof now>} s */
async function loadLyrics(s) {
  const key = trackKey(s);
  if (!settings.lyrics) return send("lyrics", { key, lines: null, plain: null });
  const cached = lyricsCache.get(key);
  if (cached) return send("lyrics", { key, ...cached });
  try {
    const res = await fetchLyrics(s);
    lyricsCache.set(key, res);
    if (lyricsCache.size > 60) lyricsCache.delete(/** @type {string} */ (lyricsCache.keys().next().value));
    if (now && trackKey(now) === key) send("lyrics", { key, ...res });
  } catch (e) {
    log("warn", "lyrics", e);
    send("lyrics", { key, lines: null, plain: null });
  }
}

function startMedia() {
  bridge = media.start({
    log,
    onState(s) {
      const changed = !media.sameTrack(s, now);
      now = s;
      send("media", s);
      if (s && changed) loadLyrics(s);
    },
    onArt(a) {
      art = a;
      send("art", a);
    },
  });
}

// ---------- menu and tray ----------

function trayIcon() {
  const img = nativeImage.createFromPath(path.join(__dirname, "..", "build", "icon.png"));
  return img.isEmpty() ? img : img.resize({ width: 16, height: 16 });
}

/** @param {"sound" | "lyrics" | "aurora"} key @param {string} label */
function toggle(key, label) {
  return /** @type {Electron.MenuItemConstructorOptions} */ ({
    label,
    type: "checkbox",
    checked: settings[key],
    click: (/** @type {Electron.MenuItem} */ i) => {
      settings[key] = i.checked;
      saveSettings();
      send("settings", settings);
      if (key === "lyrics" && now) loadLyrics(now);
    },
  });
}

function appMenu() {
  return Menu.buildFromTemplate([
    { label: now ? `${now.title} · ${now.app}` : "Nothing playing", enabled: false },
    { type: "separator" },
    toggle("aurora", "Aurora that moves to the beat"),
    toggle("lyrics", "Synced lyrics"),
    toggle("sound", "Sounds"),
    {
      label: "Open at login",
      type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }),
    },
    { type: "separator" },
    { label: "Help and privacy", click: () => shell.openExternal(SITE) },
    { label: "Uninstall…", click: () => shell.openExternal("ms-settings:appsfeatures") },
    { type: "separator" },
    { label: `Quit Music Notch ${pkg.version}`, click: () => app.quit() },
  ]);
}

function buildTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip("Music Notch");
  tray.on("right-click", () => tray.popUpContextMenu(appMenu()));
  tray.on("click", () => send("open"));
}

const COMMANDS = new Set(["toggle", "play", "pause", "next", "prev"]);
ipcMain.on("control", (_e, cmd, value) => {
  if (COMMANDS.has(cmd)) bridge?.send(cmd);
  else if (cmd === "seek" && Number.isFinite(value)) bridge?.send(`seek ${Math.max(0, Math.round(value))}`);
});
ipcMain.on("menu", () => alive(win) && appMenu().popup({ window: win }));
ipcMain.on("quit", () => app.quit());
ipcMain.on("hover", (_e, inside) => {
  if (!alive(win)) return;
  win.setIgnoreMouseEvents(!inside, { forward: true });
  if (inside) win.focus();
});
ipcMain.handle("init", () => ({ settings, now, art }));

// ---------- boot ----------

app.on("second-instance", () => !quitting && send("open"));
app.on("window-all-closed", () => {});
app.on("will-quit", () => bridge?.stop());

app.whenReady().then(() => {
  if (!tooling && firstRun) {
    saveSettings();
    app.setLoginItemSettings({ openAtLogin: true });
  }
  allowLoopback();
  createWindow();
  if (tooling) return void (arg("live") && startMedia());
  buildTray();
  startMedia();
  screen.on("display-metrics-changed", () => {
    if (!alive(win)) return;
    const p = placement();
    win.setPosition(p.x, p.y);
  });
});
