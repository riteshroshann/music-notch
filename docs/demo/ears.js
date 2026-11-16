// Listens to what Windows is playing (loopback audio) and boils it down to a few numbers per
// frame: bass, mids, highs, overall energy and a beat pulse. Without a real stream (the website
// demo, or capture refused) it makes up a 118 bpm groove so the aurora still dances.
const Ears = (() => {
  /** @type {AnalyserNode | null} */
  let analyser = null;
  /** @type {Uint8Array} */
  let bins = new Uint8Array(0);
  /** @type {MediaStream | null} */
  let stream = null;
  /** @type {AudioContext | null} */
  let ctx = null;
  let fake = false;

  const out = { bass: 0, mid: 0, high: 0, energy: 0, beat: 0, bands: [0, 0, 0, 0, 0], live: false };
  let avgBass = 0;
  let lastBeat = 0;

  async function listen() {
    if (analyser || !navigator.mediaDevices?.getDisplayMedia) return false;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: { width: 1, height: 1, frameRate: 1 },
      });
      // the screen is only the ticket for the audio; drop it straight away
      for (const t of stream.getVideoTracks()) {
        t.stop();
        stream.removeTrack(t);
      }
      if (!stream.getAudioTracks().length) throw new Error("no loopback audio");
      ctx = new AudioContext();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.55;
      ctx.createMediaStreamSource(stream).connect(analyser);
      bins = new Uint8Array(analyser.frequencyBinCount);
      out.live = true;
      return true;
    } catch {
      stop();
      return false;
    }
  }

  function stop() {
    for (const t of stream?.getTracks() ?? []) t.stop();
    stream = null;
    analyser = null;
    ctx?.close().catch(() => {});
    ctx = null;
    out.live = false;
  }

  /** Mean of bins between two frequencies, 0..1. @param {number} lo @param {number} hi */
  function band(lo, hi) {
    if (!analyser || !ctx) return 0;
    const hz = ctx.sampleRate / analyser.fftSize;
    const a = Math.max(1, Math.floor(lo / hz));
    const b = Math.min(bins.length - 1, Math.ceil(hi / hz));
    let s = 0;
    for (let i = a; i <= b; i++) s += /** @type {number} */ (bins[i]);
    return s / ((b - a + 1) * 255);
  }

  /** Made-up groove: kick on every beat, snare-ish lift on 2 and 4, a wandering melody. @param {number} t */
  function groove(t) {
    const spb = 60 / 118;
    const ph = (t / 1000 / spb) % 1;
    const beatN = Math.floor(t / 1000 / spb);
    const kick = Math.exp(-ph * 9);
    const snare = beatN % 2 ? Math.exp(-ph * 14) : 0;
    const swell = 0.5 + 0.5 * Math.sin(t / 2300);
    return {
      bass: 0.38 + kick * 0.5,
      mid: 0.3 + 0.25 * swell + snare * 0.25,
      high: 0.18 + 0.15 * Math.sin(t / 310) ** 2 + snare * 0.3,
    };
  }

  /**
   * Sample this frame. `playing` false lets everything settle to rest.
   * @param {number} t @param {boolean} playing
   */
  function read(t, playing) {
    let bass = 0;
    let mid = 0;
    let high = 0;
    if (playing && analyser) {
      analyser.getByteFrequencyData(bins);
      bass = band(30, 150);
      mid = band(250, 2000);
      high = band(2500, 9000);
    } else if (playing && fake) {
      ({ bass, mid, high } = groove(t));
    }
    const ease = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ k) => a + (b - a) * k;
    out.bass = ease(out.bass, bass, bass > out.bass ? 0.55 : 0.12);
    out.mid = ease(out.mid, mid, 0.18);
    out.high = ease(out.high, high, 0.25);
    out.energy = ease(out.energy, (bass + mid + high) / 3, 0.08);

    // beat: bass jumps clearly above its own recent average, at most ~4 times a second
    avgBass = ease(avgBass, bass, 0.04);
    if (playing && bass > 0.18 && bass > avgBass * 1.28 && t - lastBeat > 240) {
      lastBeat = t;
      out.beat = 1;
    } else out.beat *= 0.9;

    const raw = [bass, (bass + mid) / 2, mid, (mid + high) / 2, high];
    out.bands = out.bands.map((v, i) =>
      ease(v, /** @type {number} */ (raw[i]) * (0.85 + 0.3 * Math.sin(t / (170 + i * 53) + i)), 0.3),
    );
    return out;
  }

  return {
    listen,
    stop,
    read,
    /** @param {boolean} on */ setFake(on) {
      fake = on;
    },
    get live() {
      return out.live;
    },
  };
})();
