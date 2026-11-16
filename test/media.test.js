import { expect, test } from "bun:test";
const { appName, normalise, sameTrack } = require("../src/media.js");

test("app ids become names people know", () => {
  expect(appName("Spotify.exe")).toBe("Spotify");
  expect(appName("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify")).toBe("Spotify");
  expect(appName("MSEdge")).toBe("Edge");
  expect(appName("308046B0AF4A39CB")).toBe("Firefox");
  expect(appName("Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic")).toBe("Media Player");
  expect(appName("weirdplayer.exe")).toBe("Weirdplayer");
});

test("stopped, closed and untitled sessions count as nothing playing", () => {
  expect(normalise({ type: "state", title: "x", status: "Stopped" })).toBeNull();
  expect(normalise({ type: "state", title: "", status: "Playing" })).toBeNull();
  expect(normalise({ type: "none" })).toBeNull();
});

test("a playing session is normalised", () => {
  const s = normalise({
    type: "state",
    app: "Spotify.exe",
    title: "t",
    artist: "a",
    status: "Playing",
    position: -5,
    duration: 1000,
    updated: 7,
    canNext: 1,
  });
  expect(s).toMatchObject({
    app: "Spotify",
    playing: true,
    position: 0,
    duration: 1000,
    updated: 7,
    canNext: true,
    canPrev: false,
  });
  expect(sameTrack(s, { ...s, position: 500 })).toBe(true);
  expect(sameTrack(s, { ...s, title: "u" })).toBe(false);
});
