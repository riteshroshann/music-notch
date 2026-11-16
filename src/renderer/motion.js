// Motion. Visibility is always CSS state (classes plus transitions), so however fast the
// input, everything converges on the current state. Script animates only geometry.
const Motion = (() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /**
   * Damped spring from 0 to 1, sampled into a CSS linear() easing.
   * @param {number} stiffness @param {number} damping
   */
  function spring(stiffness = 260, damping = 22) {
    const dt = 1 / 120;
    let x = 0;
    let v = 0;
    let t = 0;
    let still = 0;
    const pts = [];
    while (t < 2 && still < 12) {
      v += (-stiffness * (x - 1) - damping * v) * dt;
      x += v * dt;
      t += dt;
      pts.push(x);
      still = Math.abs(x - 1) < 0.004 && Math.abs(v) < 0.05 ? still + 1 : 0;
    }
    const step = Math.max(1, Math.floor(pts.length / 60));
    const sampled = pts.filter((_, i) => i % step === 0);
    sampled[sampled.length - 1] = 1;
    return { easing: `linear(0, ${sampled.map((p) => p.toFixed(4)).join(", ")})`, duration: Math.round(t * 1000) };
  }

  const bouncy = spring(420, 30);
  const snappy = spring(560, 47);
  const soft = spring(300, 32);
  const root = document.documentElement.style;
  root.setProperty("--spring", soft.easing);
  root.setProperty("--spring-ms", `${soft.duration}ms`);

  /**
   * Open or close an island, starting from wherever it is right now.
   * @param {HTMLElement} el @param {boolean} open
   */
  function morph(el, open) {
    const from = el.getBoundingClientRect();
    for (const a of el.getAnimations()) if (a.id === "size") a.cancel();
    el.classList.toggle("open", open);
    if (reduced) return;
    const to = el.getBoundingClientRect();
    const s = open ? bouncy : snappy;
    const a = el.animate(
      [
        { width: `${from.width}px`, height: `${from.height}px` },
        { width: `${to.width}px`, height: `${to.height}px` },
      ],
      { duration: s.duration, easing: s.easing },
    );
    a.id = "size";
  }

  /**
   * Show page `index`, sliding in from `dir` while the old page leaves the other way.
   * @param {HTMLElement[]} pages @param {number} index @param {number} dir
   */
  function page(pages, index, dir) {
    pages[0]?.parentElement?.style.setProperty("--out", `${-dir * 36}px`);
    const incoming = pages[index];
    if (incoming && !incoming.classList.contains("active") && !reduced) {
      incoming.style.transition = "none";
      incoming.style.transform = `translateX(${dir * 36}px)`;
      incoming.getBoundingClientRect();
      incoming.style.transition = "";
      incoming.style.transform = "";
    }
    pages.forEach((p, i) => p.classList.toggle("active", i === index));
  }

  /** Islands drop in from the top edge on launch. @param {Element[]} nodes */
  function intro(nodes) {
    if (reduced) return;
    nodes.forEach((n, i) =>
      n.animate([{ transform: "translateY(-120%)" }, { transform: "none" }], {
        duration: bouncy.duration,
        easing: bouncy.easing,
        delay: 40 + i * 70,
        fill: "backwards",
      }),
    );
  }

  /** Hover lift and press: one animation per island, replaced each time. @param {HTMLElement} el @param {number} scale */
  function press(el, scale) {
    if (reduced) return;
    const current = getComputedStyle(el).scale;
    for (const a of el.getAnimations()) if (a.id === "press") a.cancel();
    const a = el.animate([{ scale: current === "none" ? "1" : current }, { scale: String(scale) }], {
      duration: bouncy.duration,
      easing: bouncy.easing,
      fill: "forwards",
    });
    a.id = "press";
  }

  /** Grow bars or numbers in from nothing; nothing held after the end. @param {Element[]} nodes @param {string} prop */
  function grow(nodes, prop) {
    if (reduced) return;
    nodes.forEach((n, i) =>
      n.animate([{ transform: `${prop}(0)` }, { transform: `${prop}(1)` }], {
        duration: bouncy.duration,
        easing: bouncy.easing,
        delay: 120 + i * 45,
        fill: "backwards",
      }),
    );
  }

  /** A soft jelly wobble, like poking a bubble. @param {HTMLElement} el @param {number} [amp] */
  function jelly(el, amp = 1) {
    if (reduced) return;
    for (const a of el.getAnimations()) if (a.id === "jelly") a.cancel();
    const k = (/** @type {number} */ v) => String(1 + (v - 1) * amp);
    const a = el.animate(
      [
        { scale: "1 1" },
        { scale: `${k(1.07)} ${k(0.93)}` },
        { scale: `${k(0.96)} ${k(1.05)}` },
        { scale: `${k(1.025)} ${k(0.985)}` },
        { scale: `${k(0.995)} ${k(1.005)}` },
        { scale: "1 1" },
      ],
      { duration: 620, easing: "cubic-bezier(.25,.9,.3,1)" },
    );
    a.id = "jelly";
  }

  /** Something new arrived: rise in from a soft blur. @param {Element[]} nodes */
  function pop(nodes) {
    if (reduced) return;
    nodes.forEach((n, i) =>
      n.animate(
        [
          { opacity: 0.2, scale: "0.9", filter: "blur(6px)", translate: "0 6px" },
          { opacity: 1, scale: "1", filter: "blur(0)", translate: "0 0" },
        ],
        { duration: bouncy.duration, easing: bouncy.easing, delay: i * 50 },
      ),
    );
  }

  return { morph, page, intro, press, grow, spring, jelly, pop };
})();
