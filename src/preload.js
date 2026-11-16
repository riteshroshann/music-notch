const { contextBridge, ipcRenderer } = require("electron");

const CHANNELS = new Set(["media", "art", "lyrics", "settings", "collapse", "open"]);

contextBridge.exposeInMainWorld("notch", {
  init: () => ipcRenderer.invoke("init"),
  hover: (/** @type {boolean} */ inside) => ipcRenderer.send("hover", inside),
  control: (/** @type {string} */ cmd, /** @type {number} */ value) => ipcRenderer.send("control", cmd, value),
  quit: () => ipcRenderer.send("quit"),
  menu: () => ipcRenderer.send("menu"),
  on: (/** @type {string} */ channel, /** @type {(v: any) => void} */ fn) => {
    if (CHANNELS.has(channel)) ipcRenderer.on(channel, (_e, v) => fn(v));
  },
});
