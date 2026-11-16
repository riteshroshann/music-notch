// Synthesised UI sounds. Nothing sampled, so there are no assets to ship.
// open: a soft rising two-note bloop with a felt-tap transient. close: the same, falling.
const Sound = (() => {
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let master = null;
  let enabled = true;

  function audio() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.22;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
    }
    return /** @type {{ ctx: AudioContext, out: GainNode }} */ ({ ctx, out: master });
  }

  /** One damped sine with a pitch glide. */
  function tone(f0, f1, at, dur, vol, type = "sine") {
    const { ctx, out } = audio();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = /** @type {OscillatorType} */ (type);
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f1, at + dur * 0.6);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  /** Band-passed noise burst: the tactile "tap" under each sound. */
  function tap(at, freq, vol) {
    const { ctx, out } = audio();
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4;
    const src = ctx.createBufferSource();
    const bp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = buf;
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 1.2;
    g.gain.value = vol;
    src.connect(bp).connect(g).connect(out);
    src.start(at);
  }

  const play = {
    open() {
      const t = audio().ctx.currentTime + 0.005;
      tap(t, 1800, 0.5);
      tone(520, 780, t, 0.16, 0.5);
      tone(780, 1170, t + 0.055, 0.22, 0.32);
      tone(1560, 2340, t + 0.055, 0.12, 0.05, "triangle");
    },
    close() {
      const t = audio().ctx.currentTime + 0.005;
      tap(t, 1200, 0.35);
      tone(700, 470, t, 0.14, 0.38);
      tone(470, 350, t + 0.045, 0.16, 0.22);
    },
    hover() {
      const t = audio().ctx.currentTime;
      tone(2600, 2400, t, 0.035, 0.06);
    },
    page() {
      const t = audio().ctx.currentTime;
      tap(t, 2600, 0.25);
      tone(1320, 1250, t, 0.06, 0.12);
    },
    success() {
      const t = audio().ctx.currentTime + 0.005;
      [660, 880, 1320].forEach((f, i) => tone(f, f, t + i * 0.07, 0.25, 0.25));
    },
  };

  return {
    /** @param {boolean} on */ setEnabled(on) {
      enabled = on;
    },
    /** @param {keyof typeof play} name */
    play(name) {
      if (!enabled) return;
      try {
        if (audio().ctx.state === "suspended") audio().ctx.resume();
        play[name]();
      } catch {}
    },
  };
})();
