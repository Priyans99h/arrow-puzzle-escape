/**
 * audio.js
 * All sound effects are synthesized with the Web Audio API, so the game
 * never depends on downloading copyrighted audio files. Background music
 * is a soft generated ambient loop. Audio only starts after first user
 * interaction to respect browser autoplay policies.
 */

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.musicNodes = null;
    this.musicGain = null;
    this.unlocked = false;
  }

  _ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  unlock() {
    if (this.unlocked) return;
    const ctx = this._ensureContext();
    if (!ctx) return;
    this.unlocked = true;
    if (gameStorage.get('settings.music')) this.startMusic();
  }

  get soundOn() { return gameStorage.get('settings.sound'); }
  get musicOn() { return gameStorage.get('settings.music'); }
  get vibrationOn() { return gameStorage.get('settings.vibration'); }

  vibrate(pattern) {
    if (!this.vibrationOn) return;
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
    }
  }

  _tone({ freq = 440, duration = 0.15, type = 'sine', gain = 0.15, sweep = null, delay = 0 }) {
    if (!this.soundOn) return;
    const ctx = this._ensureContext();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(sweep, t0 + duration);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  click() { this._tone({ freq: 520, duration: 0.06, type: 'triangle', gain: 0.1 }); }
  select() { this._tone({ freq: 660, duration: 0.08, type: 'sine', gain: 0.12 }); }
  escape() {
    this._tone({ freq: 440, duration: 0.18, type: 'sine', sweep: 880, gain: 0.16 });
    this.vibrate(15);
  }
  blocked() {
    this._tone({ freq: 160, duration: 0.14, type: 'sawtooth', sweep: 90, gain: 0.12 });
    this.vibrate([10, 30, 10]);
  }
  hint() { this._tone({ freq: 720, duration: 0.12, type: 'sine', gain: 0.1 }); this._tone({ freq: 900, duration: 0.12, type: 'sine', gain: 0.08, delay: 0.08 }); }
  combo(level) {
    const base = 500 + Math.min(level, 10) * 40;
    this._tone({ freq: base, duration: 0.1, type: 'square', gain: 0.08 });
  }
  levelComplete() {
    [523, 659, 784, 1047].forEach((f, i) => this._tone({ freq: f, duration: 0.22, type: 'sine', gain: 0.14, delay: i * 0.1 }));
    this.vibrate([20, 40, 20, 40, 60]);
  }
  threeStars() {
    [659, 784, 988, 1318].forEach((f, i) => this._tone({ freq: f, duration: 0.25, type: 'triangle', gain: 0.15, delay: i * 0.09 }));
  }
  unlock() { this._tone({ freq: 700, duration: 0.15, type: 'sine', sweep: 1100, gain: 0.13 }); }
  reset() { this._tone({ freq: 300, duration: 0.2, type: 'sawtooth', sweep: 120, gain: 0.1 }); }
  transition() { this._tone({ freq: 480, duration: 0.09, type: 'sine', gain: 0.07 }); }

  /**
   * Soft, calm ambient pad loop.
   * Slow overlapping chords (long attack/release) through a gentle
   * lowpass filter, plus a subtle feedback delay for a sense of space.
   * No percussive attacks anywhere — this should sit quietly under the
   * game and never compete with sound effects.
   */
  startMusic() {
    const ctx = this._ensureContext();
    if (!ctx || !this.musicOn || this.musicNodes) return;

    const master = ctx.createGain();
    master.gain.value = 0.05;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    filter.Q.value = 0.3;

    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = 0.7;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.22;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;

    filter.connect(master);
    filter.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(master);
    master.connect(ctx.destination);

    this.musicGain = master;
    this.musicFilter = filter;

    // Gentle chord cycle (A minor-ish, lydian-leaning) — calm, unresolved, loopable.
    const chords = [
      [220.0, 277.18, 329.63],   // A, C#, E
      [196.0, 246.94, 329.63],   // G, B, E
      [174.61, 220.0, 261.63],   // F, A, C
      [220.0, 261.63, 329.63]    // A, C, E
    ];

    let chordIndex = 0;
    const chordDuration = 6.5; // seconds, with overlap for a seamless pad

    const playChord = (freqs, startTime) => {
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = i === 0 ? 'sine' : 'triangle';
        osc.frequency.value = freq / 2; // one octave down, calmer register
        const g = ctx.createGain();
        const peak = 0.5 / freqs.length;
        g.gain.setValueAtTime(0.0001, startTime);
        g.gain.exponentialRampToValueAtTime(peak, startTime + 2.2);          // slow attack
        g.gain.setValueAtTime(peak, startTime + chordDuration - 2.5);
        g.gain.exponentialRampToValueAtTime(0.0001, startTime + chordDuration); // slow release
        osc.connect(g).connect(filter);
        osc.start(startTime);
        osc.stop(startTime + chordDuration + 0.1);
      });
    };

    const scheduleAheadTime = chordDuration * 2;
    let nextChordTime = ctx.currentTime + 0.1;

    const scheduler = () => {
      if (!this.musicNodes) return;
      while (nextChordTime < ctx.currentTime + scheduleAheadTime) {
        playChord(chords[chordIndex % chords.length], nextChordTime);
        chordIndex++;
        nextChordTime += chordDuration * 0.85; // slight overlap between chords
      }
    };

    scheduler();
    this.musicNodes = setInterval(scheduler, 2000);
  }

  stopMusic() {
    if (this.musicNodes) {
      clearInterval(this.musicNodes);
      this.musicNodes = null;
    }
    if (this.musicGain) {
      this.musicGain.disconnect();
      this.musicGain = null;
    }
    if (this.musicFilter) {
      this.musicFilter.disconnect();
      this.musicFilter = null;
    }
  }

  toggleMusic(on) {
    gameStorage.set('settings.music', on);
    if (on) this.startMusic(); else this.stopMusic();
  }
}

const audioSystem = new AudioSystem();
['pointerdown', 'keydown', 'touchstart'].forEach(evt =>
  window.addEventListener(evt, () => audioSystem.unlock(), { once: true, passive: true })
);
