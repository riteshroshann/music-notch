// A stand-in music app for testing: plays a synthesised 120 bpm loop through a real <audio>
// element, so Chromium registers it with Windows' media controls exactly like Spotify does.
// Prints every control it receives. Run: just player  (add --seconds=N to stop on its own)
const { app, BrowserWindow } = require("electron");

const seconds = Number(process.argv.find((a) => a.startsWith("--seconds="))?.slice(10) ?? 0);

const page = `<!doctype html><body><audio id="a" loop></audio><script>
const rate = 44100, len = rate * 8;
const pcm = new Int16Array(len);
for (let i = 0; i < len; i++) {
  const t = i / rate, ph = t % 0.5;
  const kick = Math.sin(2 * Math.PI * (45 + 90 * Math.exp(-ph * 30)) * ph) * Math.exp(-ph * 9);
  const pad = 0.12 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277.2 * t) + Math.sin(2 * Math.PI * 329.6 * t));
  pcm[i] = Math.max(-1, Math.min(1, 0.55 * kick + pad * 0.5)) * 32767;
}
const head = new DataView(new ArrayBuffer(44));
const str = (o, s) => [...s].forEach((c, k) => head.setUint8(o + k, c.charCodeAt(0)));
str(0, "RIFF"); head.setUint32(4, 36 + len * 2, true); str(8, "WAVE"); str(12, "fmt ");
head.setUint32(16, 16, true); head.setUint16(20, 1, true); head.setUint16(22, 1, true);
head.setUint32(24, rate, true); head.setUint32(28, rate * 2, true); head.setUint16(32, 2, true);
head.setUint16(34, 16, true); str(36, "data"); head.setUint32(40, len * 2, true);
const a = document.getElementById("a");
a.src = URL.createObjectURL(new Blob([head, pcm], { type: "audio/wav" }));
a.volume = 0.35;
const songs = [["Blinding Lights", "The Weeknd", "After Hours", "#e23b3b"], ["Levitating", "Dua Lipa", "Future Nostalgia", "#3b6be2"]];
let i = 0;
function cover(c) {
  const cv = document.createElement("canvas"); cv.width = cv.height = 256;
  const g = cv.getContext("2d"); g.fillStyle = c; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#ffd36b"; g.beginPath(); g.arc(160, 100, 60, 0, 7); g.fill();
  return cv.toDataURL("image/png");
}
function meta() {
  const [title, artist, album, c] = songs[i];
  navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album, artwork: [{ src: "http://127.0.0.1:__PORT__/" + i + ".png", sizes: "256x256", type: "image/png" }] });
  console.log("now", title);
}
const say = (m) => console.log("control", m);
navigator.mediaSession.setActionHandler("play", () => { say("play"); a.play(); });
navigator.mediaSession.setActionHandler("pause", () => { say("pause"); a.pause(); });
navigator.mediaSession.setActionHandler("nexttrack", () => { say("next"); i = (i + 1) % songs.length; a.currentTime = 0; meta(); });
navigator.mediaSession.setActionHandler("previoustrack", () => { say("prev"); i = (i + songs.length - 1) % songs.length; a.currentTime = 0; meta(); });
navigator.mediaSession.setActionHandler("seekto", (d) => { say("seek " + d.seekTime.toFixed(1)); a.currentTime = d.seekTime; });
meta();
a.play().then(() => console.log("playing"));
</script>`;

// Chromium only hands Windows artwork it fetched over http, so serve two plain covers locally.
const covers = [
  [59, 59, 226],
  [226, 107, 59],
];
/** A flat cover with a warm sun, as raw BGRA pixels. @param {number[]} bgr */
function coverPng(bgr) {
  const n = 256;
  const px = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const sun = (x - 160) ** 2 + (y - 100) ** 2 < 3600;
      const o = (y * n + x) * 4;
      px.set(sun ? [107, 211, 255, 255] : [...bgr, 255], o);
    }
  return require("electron").nativeImage.createFromBitmap(px, { width: n, height: n }).toPNG();
}
const server = require("node:http")
  .createServer((req, res) => {
    const i = Number(req.url?.match(/(\d)\.png/)?.[1] ?? 0);
    res.writeHead(200, { "Content-Type": "image/png" });
    res.end(coverPng(/** @type {number[]} */ (covers[i])));
  })
  .listen(0, "127.0.0.1");

app.whenReady().then(() => {
  const w = new BrowserWindow({ show: false, webPreferences: { autoplayPolicy: "no-user-gesture-required" } });
  w.webContents.on("console-message", (_e, _l, msg) => console.log(msg));
  const port = /** @type {import("node:net").AddressInfo} */ (server.address()).port;
  w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page.replace("__PORT__", String(port)))}`);
  if (seconds) setTimeout(() => app.quit(), seconds * 1000);
});
