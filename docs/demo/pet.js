// The pet that lives in the closed notch. Its eyes follow your cursor anywhere on screen,
// it blinks at random, bobs on the beat, dozes when the music pauses, and looks surprised
// when the song changes. Hover makes it happy. All of it is CSS state plus a few variables.
const Pet = (() => {
  const pet = /** @type {HTMLElement} */ (document.getElementById("pet"));
  const face = /** @type {HTMLElement} */ (document.getElementById("face"));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** @type {{ x: number, y: number } | null} */
  let cursor = null;
  let ex = 0;
  let ey = 0;
  let nearS = 0;
  let blinkAt = -1e9;
  let nextBlink = 1200;
  let double = false;
  /** @type {Record<string, number>} */
  const timers = {};

  /** Where the cursor is, in this window's CSS pixels. @param {number} x @param {number} y */
  function look(x, y) {
    cursor = { x, y };
  }

  /** Show a mood for a moment. @param {string} name @param {number} ms */
  function mood(name, ms) {
    pet.classList.add(name);
    clearTimeout(timers[name]);
    timers[name] = window.setTimeout(() => pet.classList.remove(name), ms);
  }

  const clamp = (/** @type {number} */ v) => Math.max(-1, Math.min(1, v));

  /**
   * One frame: follow the cursor, blink, bob.
   * @param {number} t @param {{ beat: number }} ears @param {boolean} playing
   */
  function tick(t, ears, playing) {
    pet.classList.toggle("sleepy", !playing);
    if (reduced) return;

    let tx = 0;
    let ty = 0;
    let near = 0;
    if (cursor) {
      const r = face.getBoundingClientRect();
      const dx = cursor.x - (r.left + r.width / 2);
      const dy = cursor.y - (r.top + r.height / 2);
      tx = clamp(dx / 160) * 3.6;
      ty = clamp(dy / 110) * 2.2;
      near = Math.max(0, 1 - Math.hypot(dx, dy) / 140); // perk up as the cursor comes close
    }
    nearS += (near - nearS) * 0.12;
    face.style.setProperty("--near", nearS.toFixed(3));
    ex += (tx - ex) * 0.16;
    ey += (ty - ey) * 0.16;
    face.style.setProperty("--ex", `${ex.toFixed(2)}px`);
    face.style.setProperty("--ey", `${ey.toFixed(2)}px`);
    face.style.setProperty("--fy", `${(playing ? -ears.beat * 1.8 : 0).toFixed(2)}px`);

    // blink every 2.6 to 5.2 s, sometimes twice in a row
    if (t > nextBlink && playing) {
      blinkAt = t;
      double = Math.random() < 0.22;
      nextBlink = t + 2600 + Math.random() * 2600;
    }
    const since = t - blinkAt;
    const shut = since < 110 || (double && since > 220 && since < 330);
    face.style.setProperty("--lid", shut ? "0.12" : "1");
  }

  return { look, mood, tick };
})();
