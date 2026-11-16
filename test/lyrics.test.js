import { describe, expect, test } from "bun:test";
const { parseLrc, lineAt, cleanTitle, firstArtist, pick } = require("../src/lyrics.js");

describe("parseLrc", () => {
  test("reads stamps, sorts, keeps blank lines as gaps", () => {
    const lines = parseLrc("[ar:x]\n[00:12.50]second\n[00:01.00]first\n[00:20.00]\n");
    expect(lines).toEqual([
      { t: 1000, text: "first" },
      { t: 12500, text: "second" },
      { t: 20000, text: "" },
    ]);
  });
  test("several stamps on one line repeat it", () => {
    expect(parseLrc("[00:01.00][00:05.00]chorus").map((l) => l.t)).toEqual([1000, 5000]);
  });
  test("two-digit fractions are hundredths, offset shifts everything", () => {
    expect(parseLrc("[offset:+500]\n[00:02.05]a")[0]).toEqual({ t: 1550, text: "a" });
  });
});

describe("lineAt", () => {
  const lines = [
    { t: 1000, text: "a" },
    { t: 3000, text: "b" },
    { t: 5000, text: "c" },
  ];
  test("before, on and between lines", () => {
    expect(lineAt(lines, 0)).toBe(-1);
    expect(lineAt(lines, 3000)).toBe(1);
    expect(lineAt(lines, 4999)).toBe(1);
    expect(lineAt(lines, 99999)).toBe(2);
  });
});

describe("cleaning search terms", () => {
  test("store suffixes come off titles", () => {
    expect(cleanTitle("Song (feat. Someone)")).toBe("Song");
    expect(cleanTitle("Song - Remastered 2011")).toBe("Song");
    expect(cleanTitle("Song (Radio Edit)")).toBe("Song");
    expect(cleanTitle("where the sunlight glows")).toBe("where the sunlight glows");
  });
  test("first artist only", () => {
    expect(firstArtist("88rising, yung kai, sunkis")).toBe("88rising");
    expect(firstArtist("Ex Habit & Beneld")).toBe("Ex Habit");
  });
  test("pick prefers synced lyrics close in length", () => {
    const hits = [
      { duration: 200, plainLyrics: "x" },
      { duration: 163, syncedLyrics: "[00:01.00]y" },
      { duration: 300, syncedLyrics: "[00:01.00]z" },
    ];
    expect(pick(hits, 162)?.duration).toBe(163);
    expect(pick([{ duration: 400, syncedLyrics: "a" }], 160)).toBeNull();
  });
});

describe("estimate", () => {
  const { estimate } = require("../src/lyrics.js");
  test("spreads plain lines through the song, longer lines get longer", () => {
    const lines = estimate("[Verse]\nshort\na much much longer line here\n\nend", 180000);
    expect(lines?.map((l) => l.text)).toEqual(["short", "a much much longer line here", "end"]);
    const [a, b, c] = /** @type {{ t: number }[]} */ (lines);
    expect(a.t).toBe(14400);
    expect(c.t - b.t).toBeGreaterThan(b.t - a.t);
    expect(c.t).toBeLessThan(180000);
  });
  test("too short or empty gives nothing", () => {
    expect(estimate("hi", 10000)).toBeNull();
    expect(estimate("\n\n", 200000)).toBeNull();
  });
});
