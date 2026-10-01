import { store } from './dom';

export type Sfx =
  | 'place'
  | 'boom'
  | 'trap'
  | 'free'
  | 'pop'
  | 'pick'
  | 'kick'
  | 'dart'
  | 'jump'
  | 'slip'
  | 'portal'
  | 'beep'
  | 'go'
  | 'win'
  | 'lose'
  | 'click'
  | 'siren'
  | 'thud'
  | 'chime'
  | 'whoosh';

const NOTE: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const freq = (n: string) => {
  const m = /^([A-G]#?)(\d)$/.exec(n);
  if (!m) return 0;
  return 440 * 2 ** ((NOTE[m[1]!]! + (Number(m[2]) - 4) * 12 - 9) / 12);
};

/** Three short chiptune loops (eighth notes, "-" = rest). */
const TUNES: { bpm: number; lead: string; bass: string }[] = [
  {
    bpm: 132,
    lead: 'C5 E5 G5 E5 F5 A5 G5 - E5 G5 C6 B5 A5 G5 E5 - D5 F5 A5 F5 E5 G5 C5 - D5 E5 F5 D5 C5 - - -',
    bass: 'C3 - G3 - F3 - G3 - C3 - E3 - F3 - G3 - D3 - A3 - C3 - E3 - G2 - B2 - C3 - G2 -',
  },
  {
    bpm: 112,
    lead: 'A4 - C5 E5 D5 - C5 B4 A4 - E5 - D5 C5 B4 - G4 - B4 D5 C5 - B4 A4 G#4 - B4 - A4 - - -',
    bass: 'A2 - E3 - A2 - E3 - F2 - C3 - F2 - C3 - D3 - A3 - E2 - B2 - E2 - G#2 - A2 - E2 -',
  },
  {
    bpm: 150,
    lead: 'E5 E5 - E5 - C5 E5 - G5 - - - G4 - - - C5 - G4 - E4 - A4 B4 A#4 A4 G4 E5 G5 A5 F5 G5',
    bass: 'C3 - C3 - G2 - G2 - C3 - C3 - G2 - G2 - F2 - F2 - C3 - C3 - G2 - G2 - C3 - G2 -',
  },
];

export class Audio {
  sfxOn = store.get('bnb.sfx') !== 'off';
  musicOn = store.get('bnb.music') !== 'off';
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private tune = -1;
  private step = 0;
  private nextAt = 0;
  private timer = 0;

  /** Browsers only allow audio after a user gesture; call this from a click or key handler. */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.5;
      this.sfxGain.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.12;
      this.musicGain.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.6;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleSfx(): boolean {
    this.sfxOn = !this.sfxOn;
    store.set('bnb.sfx', this.sfxOn ? 'on' : 'off');
    return this.sfxOn;
  }

  toggleMusic(): boolean {
    this.musicOn = !this.musicOn;
    store.set('bnb.music', this.musicOn ? 'on' : 'off');
    if (this.musicGain) this.musicGain.gain.value = this.musicOn ? 0.12 : 0;
    return this.musicOn;
  }

  play(name: Sfx): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxOn || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    switch (name) {
      case 'place':
        this.tone(t, 330, 660, 0.09, 'sine', 0.5);
        break;
      case 'boom':
        this.noise(t, 0.45, 1800, 200, 0.9);
        this.tone(t, 120, 50, 0.3, 'sine', 0.7);
        break;
      case 'trap':
        this.tone(t, 500, 260, 0.35, 'triangle', 0.45, 18);
        break;
      case 'free':
        [523, 659, 784, 1047].forEach((f, k) => this.tone(t + k * 0.06, f, f, 0.08, 'square', 0.18));
        break;
      case 'pop':
        this.noise(t, 0.15, 4000, 800, 0.6);
        this.tone(t + 0.05, 700, 180, 0.3, 'square', 0.25);
        break;
      case 'pick':
        this.tone(t, 880, 880, 0.07, 'square', 0.18);
        this.tone(t + 0.07, 1320, 1320, 0.1, 'square', 0.18);
        break;
      case 'kick':
        this.tone(t, 200, 90, 0.1, 'triangle', 0.6);
        break;
      case 'dart':
        this.noise(t, 0.12, 6000, 2000, 0.3);
        break;
      case 'jump':
        this.tone(t, 300, 900, 0.18, 'square', 0.2);
        break;
      case 'slip':
        this.tone(t, 900, 200, 0.3, 'sawtooth', 0.15);
        break;
      case 'portal':
        this.tone(t, 200, 1200, 0.35, 'sine', 0.3, 10);
        break;
      case 'beep':
        this.tone(t, 440, 440, 0.12, 'square', 0.2);
        break;
      case 'go':
        this.tone(t, 880, 880, 0.3, 'square', 0.22);
        break;
      case 'win':
        [523, 659, 784, 1047, 784, 1047].forEach((f, k) => this.tone(t + k * 0.11, f, f, 0.12, 'square', 0.2));
        break;
      case 'lose':
        [392, 349, 311, 262].forEach((f, k) => this.tone(t + k * 0.16, f, f, 0.16, 'triangle', 0.3));
        break;
      case 'click':
        this.tone(t, 1200, 1200, 0.03, 'square', 0.1);
        break;
      case 'siren':
        for (let k = 0; k < 4; k++) this.tone(t + k * 0.18, k % 2 ? 660 : 880, k % 2 ? 660 : 880, 0.16, 'square', 0.2);
        break;
      case 'thud':
        this.noise(t, 0.35, 900, 80, 0.9);
        this.tone(t, 110, 40, 0.35, 'sine', 0.8);
        break;
      case 'chime':
        [784, 988, 1175, 1568].forEach((f, k) => this.tone(t + k * 0.07, f, f, 0.18, 'triangle', 0.25));
        break;
      case 'whoosh':
        this.noise(t, 0.4, 600, 3000, 0.35);
        [0, 0.08, 0.16].forEach((d) => this.tone(t + d, 500, 900, 0.08, 'square', 0.12));
        break;
    }
  }

  startMusic(tune: number): void {
    this.stopMusic();
    if (!this.ctx) return;
    this.tune = tune % TUNES.length;
    this.step = 0;
    this.nextAt = this.ctx.currentTime + 0.1;
    if (this.musicGain) this.musicGain.gain.value = this.musicOn ? 0.12 : 0;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
    this.tune = -1;
  }

  private schedule(): void {
    const ctx = this.ctx;
    const tune = TUNES[this.tune];
    if (!ctx || !tune || !this.musicGain) return;
    const lead = tune.lead.split(' ');
    const bass = tune.bass.split(' ');
    const dur = 60 / tune.bpm / 2;
    while (this.nextAt < ctx.currentTime + 0.12) {
      const k = this.step % lead.length;
      const ln = lead[k] ?? '-';
      const bn = bass[k] ?? '-';
      if (ln !== '-') this.tone(this.nextAt, freq(ln), freq(ln), dur * 0.9, 'square', 0.35, 0, this.musicGain);
      if (bn !== '-') this.tone(this.nextAt, freq(bn), freq(bn), dur * 1.8, 'triangle', 0.6, 0, this.musicGain);
      this.nextAt += dur;
      this.step++;
    }
  }

  private tone(
    t: number,
    f0: number,
    f1: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    vibrato = 0,
    out: GainNode | null = this.sfxGain,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !out || !f0) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = vibrato;
      lg.gain.value = f0 * 0.06;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, f0: number, f1: number, vol: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf || !this.sfxGain) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur);
  }
}
