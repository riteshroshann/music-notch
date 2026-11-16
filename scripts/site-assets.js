// Renders docs/og.png, the PNG favicons and build/icon.png with Electron. Run: just site
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const docs = path.join(root, "docs");
const svg = fs.readFileSync(path.join(docs, "favicon.svg"), "utf8");

// aurora rays hanging under a black island, the same shapes the app draws
const rays = Array.from({ length: 120 }, (_, i) => {
  const x = 120 + i * 8;
  const n = 0.5 + 0.3 * Math.sin(i * 0.19) + 0.2 * Math.sin(i * 0.53 + 1.3);
  const h = 60 + 170 * n;
  const c = ["#3ef2b0", "#4fc3e8", "#8b5cf6"][Math.floor((i / 40) % 3)];
  return `<i style="left:${x}px;height:${h}px;background:linear-gradient(${c},transparent);opacity:${(0.35 + 0.5 * n).toFixed(2)}"></i>`;
}).join("");

const og = `<!doctype html><html><body style="margin:0;width:1200px;height:630px;background:#000;color:#f5f5f7;
font-family:'Segoe UI Variable Display','Segoe UI',sans-serif;overflow:hidden;position:relative">
<style>i{position:absolute;top:120px;width:7px;border-radius:4px}</style>
<div style="position:absolute;inset:0;filter:blur(14px) saturate(1.4)">${rays}</div>
<div style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:600px;height:150px;background:#000;
border-radius:0 0 46px 46px;box-shadow:0 0 0 1px rgba(255,255,255,.08);display:flex;align-items:center;gap:22px;padding:0 34px">
<div style="width:86px;height:86px;border-radius:18px;background:linear-gradient(135deg,#f6b73c,#e2702a 55%,#5b1f12)"></div>
<div><div style="font-size:30px;font-weight:650;letter-spacing:-.02em">where the light pools</div>
<div style="font-size:20px;color:#98989f;margin-top:4px;font-weight:600">Saffron Hours, Low Tide Club</div></div></div>
<div style="position:absolute;left:0;right:0;bottom:86px;text-align:center">
<div style="font-size:72px;font-weight:650;letter-spacing:-.045em">Music Notch</div>
<div style="font-size:27px;color:#98989f;margin-top:10px">Whatever you're playing, hanging from the top of your screen.</div></div></body></html>`;

/** @param {string} html @param {number} w @param {number} h @param {string} file */
async function shoot(html, w, h, file) {
  const win = new BrowserWindow({
    width: Math.max(w, 240),
    height: Math.max(h, 240),
    show: false,
    useContentSize: true,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {});
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h });
  fs.writeFileSync(file, img.resize({ width: w, height: h }).toPNG());
  win.destroy();
}

const icon = (/** @type {number} */ s) =>
  `<!doctype html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" width="${s}" height="${s}" style="display:block">`;

app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  await shoot(og, 1200, 630, path.join(docs, "og.png"));
  await shoot(icon(32), 32, 32, path.join(docs, "favicon-32.png"));
  await shoot(icon(180), 180, 180, path.join(docs, "apple-touch-icon.png"));
  await shoot(icon(512), 512, 512, path.join(root, "build", "icon.png"));
  console.log("assets written");
  app.quit();
});
