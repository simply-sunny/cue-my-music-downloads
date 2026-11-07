// The player behind the web player: the library, the config, play order, the game's schedule, Radio,
// automix plans and listening stats. Ported from the mod; there is no audio, so time runs on a clock.

export let STRINGS = {};

/** Component.translatable(key, args).getString(): %s and %1$s, the key itself when it's missing. */
export function tr(key, ...args) {
  const s = STRINGS[key];
  if (s === undefined) return key;
  let n = 0;
  return s.replace(/%(?:(\d+)\$)?s|%%/g, (m, i) => (m === '%%' ? '%' : String(args[i ? i - 1 : n++] ?? '')));
}

export const has = key => key in STRINGS;

/** Java's String.hashCode. */
export function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

export const floorMod = (a, n) => ((a % n) + n) % n;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function hsv(h, s, v) {
  h = ((h % 1) + 1) % 1 * 6;
  const i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  const rgb = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return (0xFF000000 | Math.round(rgb[0] * 255) << 16 | Math.round(rgb[1] * 255) << 8 | Math.round(rgb[2] * 255)) >>> 0;
}

// PackNames.
const SMALL_WORDS = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'is', 'in', 'on', 'for', 'to', 'by', 'with', 'at', 'from', 'my', 'your']);
const VERSION = /^(?:v?\d[\w.]*|\[.*]|\(.*\))$/i;
export function initials(name) {
  const words = [];
  for (const token of name.split(/\s+/)) {
    if (!token || VERSION.test(token)) continue;
    for (const w of token.split(/[^\p{L}\p{N}]+/u)) if (w && !SMALL_WORDS.has(w.toLowerCase())) words.push(w);
  }
  if (!words.length) return '?';
  const n = words.length > 3 ? 2 : words.length;
  return words.slice(0, n).map(w => w[0].toUpperCase()).join('');
}
export function gradient(name) {
  const hue = floorMod(hash(name), 360) / 360;
  return [hsv(hue, 0.55, 0.8), hsv(hue + 0.08, 0.65, 0.35)];
}

// Art: {tex}, {sprite, top, bottom}, {initials, top, bottom} or {stamp, block}.
export const block = path => ({ tex: path });
export function initialsArt(name) {
  const [top, bottom] = gradient(name);
  return { text: initials(name), top, bottom };
}

export const normalize = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export const terms = q => {
  const s = normalize(q).trim();
  return s ? s.split(/\s+/) : [];
};
export const matches = (text, ts) => ts.every(t => text.includes(t));

// ------------------------------------------------------------------ library

/** A pack of example songs, so Add-ons, Radio and the mix have something to show. Not real music. */
const SAMPLE_PACK = { id: 'file/example-pack', name: 'Example Pack', author: 'Example Artist' };
const SAMPLE_SONGS = [
  ['Lantern', 122, '8A', 214], ['Low Tide', 120, '9A', 198], ['Copper Sky', 124, '8B', 236], ['Waystone', 118, '3A', 187],
  ['Kelp Forest', 96, '10A', 205], ['Night Market', 128, '11B', 243], ['Drift', 121, '7A', 222], ['Glow Lichen', 174, '2B', 191],
];

export class Library {
  constructor(data) {
    STRINGS = data.strings;
    this.artistOrder = data.artists;
    this.artistArt = data.artistArt;
    this.pools = new Map(Object.entries(data.pools));
    this.tracks = data.tracks.map(t => ({ ...t, art: block(t.art), packId: null }));
    const pack = { ...SAMPLE_PACK, art: initialsArt(SAMPLE_PACK.name) };
    this.packs = [pack];
    for (const [title, bpm, key, seconds] of SAMPLE_SONGS) {
      this.tracks.push({ id: 'example:music/' + title.toLowerCase().replace(/ /g, '_'), title, artist: pack.author, album: pack.name,
        art: pack.art, seconds, packId: pack.id, bpm, key });
    }
    this.byId = new Map(this.tracks.map(t => [t.id, t]));
  }

  get(id) {
    return this.byId.get(id);
  }

  gameMusic() {
    return this.tracks.filter(t => t.packId === null);
  }

  addOnMusic() {
    return this.tracks.filter(t => t.packId !== null);
  }

  songsBy(artist) {
    return this.tracks.filter(t => t.artist === artist);
  }

  byPack(id) {
    return this.tracks.filter(t => t.packId === id);
  }

  pack(id) {
    return this.packs.find(p => p.id === id);
  }

  packArtists() {
    return [...new Set(this.addOnMusic().map(t => t.artist))];
  }

  inPool(t, pool) {
    return (this.pools.get(pool) || []).includes(t.id);
  }

  tracksOf(ids) {
    return ids.map(id => this.get(id)).filter(Boolean);
  }
}

// ------------------------------------------------------------------- config

export const SONG_GAPS = [-1, 0, 5, 15, 30, 60, 120, 300, 600, 1200];

export function defaultConfig(lib) {
  const game = lib.gameMusic();
  const pick = titles => titles.map(t => game.find(s => s.title === t)?.id).filter(Boolean);
  return {
    enabled: true, pitchSemitones: 0, speed: 1, eqEnabled: false, eqGains: [0, 0, 0, 0, 0, 0], eqPreset: 'flat',
    liked: pick(['Sweden', 'Wet Hands', 'Pigstep (Stereo Mix)', 'Echo in the Wind', 'Aria Math']),
    disliked: [], mixPages: ['pack:' + SAMPLE_PACK.id], pauseOnTravel: false, pauseOnLostFocus: true,
    skipWithTransition: true, autoplay: true, shuffle: false, repeat: 'off', collapsed: [], vanilla: false, automix: true,
    crossfadeSeconds: 4, keepOutOfRecordings: true, transitions: {}, lastPage: '', listsPlayed: {}, mode: 'fx',
    librarySort: 'default', radioSource: 'game', modeKeyCyclesAll: false, songGap: -1, poolEdits: {},
    playlists: [{ id: 'evening', name: 'Evening build', songs: pick(['Minecraft', 'Clark', 'Subwoofer Lullaby', 'Haggstrom', 'Moog City']) }],
    volume: 1,
  };
}

/** A track pool's songs with the player's changes laid over (TrackPools). */
export const poolEdit = (cfg, pool) => cfg.poolEdits[pool] || { added: [], removed: [] };
export const editEmpty = e => !e.added.length && !e.removed.length;
export function applyEdit(game, e) {
  return [...game.filter(id => !e.removed.includes(id)), ...e.added.filter(id => !game.includes(id))];
}
export function editAdd(e, id, inPool) {
  return inPool ? { added: e.added, removed: e.removed.filter(r => r !== id) } : { added: e.added.includes(id) ? e.added : [...e.added, id], removed: e.removed };
}
export function editRemove(e, id, inPool) {
  return inPool ? { added: e.added, removed: e.removed.includes(id) ? e.removed : [...e.removed, id] } : { added: e.added.filter(a => a !== id), removed: e.removed };
}

// ----------------------------------------------------------------- automix

export const WAVE_RATE = 25;
const RATE = 48000, MAX_STRETCH = 0.08, DRIFT_BEATS = 0.25, AUTO_SECONDS = 8, AUTO_BEATS = 16, DROP_BEATS = 64, CUT_SECONDS = 1;
export const PRESETS = ['auto', 'fade', 'rise', 'blend', 'drop', 'echo', 'cut'];
export const VOLUME = ['smooth', 'linear', 'overlap', 'cut', 'drop'];
export const EQ = ['none', 'start_bass_swap', 'early_bass_swap', 'center_bass_swap', 'late_bass_swap'];
export const FILTER = ['none', 'rise', 'fall', 'sweep', 'low_pass_in', 'low_pass_in_out'];
export const EFFECT = ['none', 'echo_out'];
export const LOOP = ['none', 'loop_out'];
export const AUTO = { preset: 'auto', shape: null, seconds: -1, startBeforeEnd: -1, enterAt: -1, beatmatchOff: false };

export const highPassIn = f => f === 'rise' || f === 'sweep';
export const lowPassIn = f => f === 'low_pass_in' || f === 'low_pass_in_out';
export const lowPassOut = f => f === 'fall' || f === 'sweep' || f === 'low_pass_in_out';

export function shapeOf(p) {
  const s = (volume, eq, filter, effect) => ({ volume, eq, filter, effect, loop: 'none' });
  switch (p) {
    case 'rise': return s('smooth', 'none', 'sweep', 'none');
    case 'blend': return s('overlap', 'center_bass_swap', 'none', 'none');
    case 'drop': return s('drop', 'start_bass_swap', 'none', 'none');
    case 'echo': return s('smooth', 'none', 'none', 'echo_out');
    case 'cut': return s('cut', 'none', 'none', 'none');
    default: return s('smooth', 'none', 'none', 'none');
  }
}

const fadeOut = t => Math.cos(clamp(t, 0, 1) * Math.PI / 2);
const fadeIn = t => Math.sin(clamp(t, 0, 1) * Math.PI / 2);
const span = (t, from, to) => clamp((t - from) / (to - from), 0, 1);

export function volumeOut(s, t) {
  const v = { linear: 1 - clamp(t, 0, 1), overlap: fadeOut(span(t, 0.5, 1)), cut: fadeOut(span(t, 0.49, 0.51)), drop: 1 - span(t, 0.5, 1) }[s.volume] ?? fadeOut(t);
  return s.effect === 'echo_out' ? v * (1 - span(t, 0.15, 0.25)) : v;
}
export function volumeIn(s, t) {
  return { linear: clamp(t, 0, 1), overlap: fadeIn(span(t, 0, 0.5)), cut: fadeIn(span(t, 0.49, 0.51)), drop: span(t, 0, 0.002) }[s.volume] ?? fadeIn(t);
}
const swapPoint = eq => (eq === 'early_bass_swap' ? 0.25 : eq === 'late_bass_swap' ? 0.75 : 0.5);
export function bassOut(s, t) {
  if (s.eq === 'none') return 1;
  if (s.eq === 'start_bass_swap') return 1 - span(t, 0, 0.002);
  const p = swapPoint(s.eq);
  return 1 - span(t, p - 0.025, p + 0.025);
}
export function bassIn(s, t) {
  if (s.eq === 'none' || s.eq === 'start_bass_swap') return 1;
  const p = swapPoint(s.eq);
  return span(t, p - 0.025, p + 0.025);
}
export const filterOut = (s, t) => (lowPassOut(s.filter) ? 1 - span(t, 0.3, 1) : 1);
export const filterIn = (s, t) => (highPassIn(s.filter) || lowPassIn(s.filter) ? span(t, 0, 0.8) : 1);

export function tempoGap(a, b) {
  const r = a / b;
  return Math.min(...[0.5, 1, 2].map(m => Math.abs(r / m - 1)));
}
export function keysMix(a, b) {
  if (!a || !b || a.length < 2 || b.length < 2) return true;
  const na = parseInt(a), nb = parseInt(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return true;
  const step = floorMod(na - nb, 12);
  return na === nb || (a.at(-1) === b.at(-1) && (step === 1 || step === 11));
}
export function stretch(a, b) {
  if (a.bpm <= 0 || b.bpm <= 0) return 1;
  let best = 1, gap = Infinity;
  for (const m of [0.5, 1, 2]) {
    const r = a.bpm / (b.bpm * m);
    if (Math.abs(r - 1) < gap) {
      gap = Math.abs(r - 1);
      best = r;
    }
  }
  return gap < 0.002 || gap > MAX_STRETCH ? 1 : best;
}
export function autoPreset(a, b, beatmatch = true) {
  if (a.bpm <= 0 || b.bpm <= 0) return 'fade';
  const gap = tempoGap(a.bpm, b.bpm);
  const left = beatmatch && stretch(a, b) !== 1 ? 0 : gap;
  if (left * 32 <= DRIFT_BEATS) return keysMix(a.key, b.key) ? 'blend' : 'rise';
  return gap <= 0.15 ? 'fade' : 'echo';
}
const wholeBars = (a, s) => Math.max(1, Math.round(s / (4 * a.beat))) * 4 * a.beat;
export const dropSeconds = a => (a.bpm > 0 ? wholeBars(a, clamp(DROP_BEATS * 60 / a.bpm, 15, 40)) : 30);
export function autoSeconds(a, shape, preset) {
  if (shape.volume === 'cut') return CUT_SECONDS;
  if (shape.volume === 'drop') return dropSeconds(a);
  const beat = a.beat;
  if (preset === 'blend') return beat > 0 ? wholeBars(a, clamp(32 * beat, 8, 24)) : 12;
  if (preset === 'echo') return beat > 0 ? wholeBars(a, clamp(8 * beat, 3, 8)) : 5;
  return beat > 0 ? wholeBars(a, clamp(AUTO_BEATS * beat, 6, 12)) : AUTO_SECONDS;
}

/** A song's analysis, made up for the example pack the way the mod measures a real one. */
export class Profile {
  constructor(t) {
    let seed = hash(t.id) >>> 0;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    this.rate = RATE;
    this.bpm = t.bpm;
    this.key = t.key;
    this.frames = Math.round(t.seconds * RATE);
    this.start = 0;
    this.end = this.frames;
    this.downbeat = 0.12 + rand() * 0.3;
    const n = Math.ceil(t.seconds * WAVE_RATE), beat = 60 / t.bpm;
    this.low = new Float32Array(n);
    this.mid = new Float32Array(n);
    this.high = new Float32Array(n);
    // An intro, the body in 8-bar sections, a break in the middle, and a fade at the end.
    const bar = 4 * beat, intro = 8 * bar, fade = 12 + rand() * 10, breakAt = t.seconds * (0.45 + rand() * 0.1);
    for (let i = 0; i < n; i++) {
      const s = i / WAVE_RATE, inBeat = ((s - this.downbeat) / beat) % 1;
      const kick = Math.exp(-((inBeat + 1) % 1) * 9);
      const section = Math.floor((s - this.downbeat) / (8 * bar));
      const level = s < intro ? 0.35 + 0.5 * s / intro : s > t.seconds - fade ? Math.max(0, (t.seconds - s) / fade) : 1;
      const brk = Math.abs(s - breakAt) < 4 * bar ? 0.35 : 1;
      const lift = 0.85 + 0.15 * Math.sin(section * 1.7);
      this.low[i] = clamp(level * brk * lift * (s < intro / 2 ? 0.15 : 0.35 + 0.6 * kick) * (0.9 + rand() * 0.1), 0, 1);
      this.mid[i] = clamp(level * lift * (0.18 + 0.17 * Math.sin(s * 0.9) ** 2 + rand() * 0.1), 0, 1);
      this.high[i] = clamp(level * (0.15 + 0.35 * Math.exp(-((inBeat * 2) % 1) * 6) + rand() * 0.1), 0, 1);
    }
  }

  get beat() {
    return this.bpm > 0 ? 60 / this.bpm : 0;
  }

  get hasBars() {
    return this.bpm > 0 && this.downbeat >= 0;
  }

  seconds(frame) {
    return frame / this.rate;
  }

  frame(s) {
    return Math.round(s * this.rate);
  }

  barAtOrAfter(frame) {
    if (!this.hasBars) return frame;
    const bar = 4 * this.beat, t = this.seconds(frame);
    return this.frame(this.downbeat + Math.ceil((t - this.downbeat) / bar - 1e-9) * bar);
  }

  barNearest(frame) {
    if (!this.hasBars) return frame;
    const bar = 4 * this.beat, t = this.seconds(frame);
    return this.frame(this.downbeat + Math.round((t - this.downbeat) / bar) * bar);
  }

  energy() {
    const s = Math.floor(this.seconds(this.start) * WAVE_RATE), t = Math.min(this.low.length, Math.ceil(this.seconds(this.end) * WAVE_RATE));
    const e = [];
    for (let i = s; i < t; i++) e.push(this.low[i] + this.mid[i] + this.high[i]);
    const usual = [...e].sort((x, y) => x - y)[Math.floor(e.length * 0.7)];
    return { s, e, usual };
  }

  musicalEnd() {
    if (this._end !== undefined) return this._end;
    const { s, e, usual } = this.energy();
    let last = -1, run = 0;
    if (e.length >= WAVE_RATE * 20 && usual > 0) {
      for (let i = 0; i < e.length; i++) {
        run += e[i] - (i >= WAVE_RATE ? e[i - WAVE_RATE] : 0);
        if (i >= WAVE_RATE - 1 && run / WAVE_RATE >= 0.4 * usual) last = i;
      }
    }
    this._end = last < 0 ? this.end : clamp(this.frame((s + last + 1) / WAVE_RATE), Math.max(this.start, this.end - this.frame(30)), this.end);
    return this._end;
  }

  musicalStart() {
    if (this._start !== undefined) return this._start;
    const { s, e, usual } = this.energy();
    this._start = this.start;
    if (e.length >= WAVE_RATE * 40 && usual > 0) {
      let run = 0;
      for (let i = 0; i < Math.min(e.length, WAVE_RATE * 21); i++) {
        run += e[i] - (i >= WAVE_RATE ? e[i - WAVE_RATE] : 0);
        if (i >= WAVE_RATE - 1 && run / WAVE_RATE >= 0.2 * usual) {
          const first = i - WAVE_RATE + 1;
          if (first >= WAVE_RATE * 3 && first <= WAVE_RATE * 20) {
            const at = this.frame((s + first) / WAVE_RATE), bar = this.barNearest(at);
            this._start = clamp(bar > at ? bar - this.frame(4 * this.beat) : bar, this.start, this.end);
          }
          break;
        }
      }
    }
    return this._start;
  }
}

export function plan(a, b, t) {
  const preset = t.preset === 'auto' ? autoPreset(a, b, !t.beatmatchOff) : t.preset;
  const shape = preset === 'custom' && t.shape ? t.shape : shapeOf(preset);
  const st = !t.beatmatchOff && shape.volume !== 'cut' ? stretch(a, b) : 1;
  const seconds = t.seconds >= 0 ? t.seconds : autoSeconds(a, shape, preset);
  const most = Math.floor(Math.min(a.end - a.start, b.end - b.start) / 4);
  const fadeFrames = clamp(a.frame(seconds), 1, Math.max(1, most));
  const enterAt = t.enterAt >= 0 ? clamp(b.frame(t.enterAt), 0, Math.max(0, b.frames - 1)) : b.musicalStart();
  let fadeStart;
  if (t.startBeforeEnd >= 0) {
    fadeStart = a.end - a.frame(t.startBeforeEnd);
  } else {
    fadeStart = a.musicalEnd() - fadeFrames;
    if (a.hasBars && shape.volume !== 'cut') {
      const lead = b.hasBars ? a.frame(b.seconds(b.barAtOrAfter(enterAt) - enterAt) / st) : 0;
      fadeStart = a.barNearest(fadeStart + lead) - lead;
    }
  }
  fadeStart = clamp(fadeStart, a.start, Math.max(a.start, a.frames - 1));
  return { preset, shape, fadeStart, fadeFrames, enterAt, stretch: st };
}

export const loopFrames = (a, fadeFrames) => Math.max(1, Math.min(a.frame(a.bpm > 0 ? 4 * a.beat : 2), Math.floor(fadeFrames / 2)));

// -------------------------------------------------------------- play order

export class PlayOrder {
  constructor() {
    this.queue = [];
    this.list = [];
    this.listKey = null;
    this.cursor = -1;
    this.fromQueue = false;
    this.repeat = 'off';
    this.shuffle = false;
    this.unshuffled = [];
  }

  static shuffled(a) {
    const out = [...a];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  setShuffle(on) {
    if (on === this.shuffle) return;
    this.shuffle = on;
    if (on) {
      this.unshuffled = this.list;
      const rest = [...this.list];
      const playing = this.cursor >= 0 && this.cursor < this.list.length ? rest.splice(this.cursor, 1)[0] : null;
      this.list = playing ? [playing, ...PlayOrder.shuffled(rest)] : PlayOrder.shuffled(rest);
      this.cursor = playing ? 0 : -1;
    } else {
      const playing = this.cursor >= 0 && this.cursor < this.list.length ? this.list[this.cursor] : null;
      this.list = this.unshuffled;
      this.unshuffled = [];
      this.cursor = playing ? this.list.indexOf(playing) : -1;
    }
  }

  finished(ended) {
    return this.repeat === 'one' && ended ? ended : this.next();
  }

  play(key, list, index) {
    this.list = [...list];
    this.listKey = key;
    this.cursor = index;
    this.fromQueue = false;
    if (this.shuffle) {
      const picked = this.list[index], rest = this.list.filter((_, i) => i !== index);
      this.unshuffled = this.list;
      this.list = [picked, ...PlayOrder.shuffled(rest)];
      this.cursor = 0;
    }
    return this.list[this.cursor];
  }

  next() {
    if (this.queue.length) {
      this.fromQueue = true;
      return this.queue.shift();
    }
    this.fromQueue = false;
    if (this.cursor + 1 < this.list.length) return this.list[++this.cursor];
    if (this.repeat !== 'off' && this.list.length) {
      this.cursor = 0;
      return this.list[0];
    }
    this.endList();
    return null;
  }

  previous() {
    if (this.fromQueue && this.cursor >= 0 && this.cursor < this.list.length) {
      this.fromQueue = false;
      return this.list[this.cursor];
    }
    if (this.cursor <= 0) return null;
    this.fromQueue = false;
    return this.list[--this.cursor];
  }

  listNext() {
    if (this.queue.length || !this.list.length) return null;
    if (this.cursor + 1 < this.list.length) return this.list[this.cursor + 1];
    return this.repeat !== 'off' ? this.list[0] : null;
  }

  extendList(more) {
    this.list = [...this.list, ...more];
    if (this.shuffle) this.unshuffled = [...this.unshuffled, ...more];
  }

  retain(keep) {
    this.queue = this.queue.filter(keep);
    if (!this.list.length) return;
    const kept = [];
    let at = -1;
    this.list.forEach((t, i) => {
      if (keep(t)) kept.push(t);
      if (i === this.cursor) at = kept.length - 1;
    });
    if (!kept.length) return this.endList();
    this.list = kept;
    this.cursor = at;
    if (this.shuffle) this.unshuffled = this.unshuffled.filter(keep);
  }

  jump(k) {
    const to = this.cursor + 1 + k;
    if (k < 0 || to >= this.list.length) return null;
    this.cursor = to;
    this.fromQueue = false;
    return this.list[to];
  }

  moveUpNext(from, to) {
    const base = Math.max(0, this.cursor + 1);
    if (from < 0 || base + from >= this.list.length) return;
    const next = [...this.list];
    const [song] = next.splice(base + from, 1);
    next.splice(clamp(base + to, base, next.length), 0, song);
    this.list = next;
  }

  upNext(n) {
    const from = Math.min(this.list.length, Math.max(0, this.cursor + 1));
    return this.list.slice(from, from + n);
  }

  endList() {
    this.list = [];
    this.unshuffled = [];
    this.listKey = null;
    this.cursor = -1;
    this.fromQueue = false;
  }

  moveQueued(from, to) {
    if (from < 0 || from >= this.queue.length) return;
    const [song] = this.queue.splice(from, 1);
    this.queue.splice(clamp(to, 0, this.queue.length), 0, song);
  }

  playQueued(i) {
    if (i < 0 || i >= this.queue.length) return null;
    this.fromQueue = true;
    return this.queue.splice(i, 1)[0];
  }
}

export function moved(list, moving, before) {
  if (before != null && moving.includes(before)) return list;
  const taken = list.filter(e => moving.includes(e)), rest = list.filter(e => !moving.includes(e));
  const at = before == null ? rest.length : rest.indexOf(before);
  rest.splice(at < 0 ? rest.length : at, 0, ...taken);
  return rest;
}

// ------------------------------------------------------------------ player

export const ALL = 'all', RADIO = 'radio';

/** CuePlayer, on a clock: what plays, the queue, the list, the game's own next song and its break. */
export class Player {
  constructor(lib, cfg, stats) {
    this.lib = lib;
    this.cfg = cfg;
    this.stats = stats;
    this.order = new PlayOrder();
    this.order.setShuffle(cfg.shuffle);
    this.current = null;
    this.position = 0;
    this.playing = false;
    this.paused = false;
    this.picked = false;
    this.radio = { seed: null, played: [] };
    this.planned = null;
    this.breakLeft = 0;
    this.previewTo = null;
    this.replan();
  }

  mode() {
    return this.cfg.vanilla ? 'vanilla' : this.cfg.mode;
  }

  allows(t) {
    const m = this.mode();
    return m === 'vanilla' || (t.packId === null) === (m === 'fx');
  }

  only(list) {
    return list.filter(t => this.allows(t));
  }

  isPlaying() {
    return this.playing && !this.paused;
  }

  /** Seconds of song time per second, as the speed setting plays it. */
  rate() {
    return this.cfg.enabled ? this.cfg.speed : 1;
  }

  tick(dt) {
    if (this.isPlaying() && this.current) {
      this.position += dt * this.rate();
      this.stats.listen(this.current, dt, this.picked, this.cfg);
      if (this.previewTo && this.current === this.previewTo && this.position >= this.previewUntil) this.stopPreview();
      if (this.position >= this.current.seconds) this.finish();
    } else if (!this.current || (!this.playing && !this.paused)) {
      if (this.planned && this.mode() !== 'vanilla') {
        this.breakLeft -= dt;
        if (this.breakLeft <= 0) this.playUpcoming();
      }
    }
  }

  start(t, at, picked) {
    this.current = t;
    this.position = at;
    this.playing = true;
    this.paused = false;
    this.picked = picked;
    this.stats.started(t);
  }

  finish() {
    const ended = this.current;
    this.stats.ended(ended);
    this.order.repeat = this.repeat();
    const n = this.order.finished(ended);
    if (n) return this.start(n, 0, this.picked || !!this.order.listKey);
    if (this.order.listKey === RADIO) return;
    // The game's music returns, after its break.
    this.playing = false;
    this.current = null;
    this.position = 0;
    this.replan(true);
  }

  /** The game's next song and the break before it: the game's Frequency (10 to 20 minutes), the set gap, or none in Add-ons. */
  replan(newBreak = false) {
    const m = this.mode();
    const pool = m === 'addons' ? this.lib.addOnMusic()
      : this.lib.tracksOf(applyEdit(this.lib.pools.get('minecraft:music.game'), poolEdit(this.cfg, 'minecraft:music.game')));
    const choices = pool.filter(t => !this.cfg.disliked.includes(t.id) && t !== this.current);
    this.planned = choices.length ? choices[Math.floor(Math.random() * choices.length)] : null;
    if (newBreak || this.breakLeft <= 0) {
      const gap = this.cfg.songGap;
      // Add-ons has no breaks: one song mixes into the next.
      this.breakLeft = m === 'addons' ? 0 : gap >= 0 ? gap : 600 + Math.random() * 600;
    }
  }

  upcoming() {
    return this.mode() === 'vanilla' ? null : this.planned;
  }

  waitingForGame() {
    return !this.current || (!this.playing && !this.paused);
  }

  /** Seconds until the game's song: its break, after what's playing and the queue when something plays. */
  untilUpcoming() {
    if (this.waitingForGame()) return Math.max(0, this.breakLeft);
    return this.breakLeft;
  }

  playUpcoming() {
    const t = this.planned;
    if (!t) return;
    this.order.endList();
    this.start(t, 0, false);
    this.replan(true);
  }

  play(key, list, index) {
    const picked = list[index];
    if (!picked || !this.allows(picked)) return;
    list = this.only(list);
    this.previewTo = null;
    this.cfg.listsPlayed[String(key)] = Date.now();
    this.order.setShuffle(this.cfg.shuffle);
    this.start(this.order.play(key, list, list.indexOf(picked)), 0, true);
  }

  playAll(key, list) {
    if (!list.length) return;
    this.play(key, list, this.cfg.shuffle ? Math.floor(Math.random() * list.length) : 0);
  }

  setShuffle(on) {
    this.cfg.shuffle = on;
    this.order.setShuffle(on);
  }

  isPlayingList(key) {
    return key === this.order.listKey;
  }

  playingList() {
    return this.order.listKey;
  }

  togglePause() {
    const t = this.current;
    if (!t) return this.next();
    if (this.paused || !this.playing) {
      this.playing = true;
      this.paused = false;
    } else {
      this.paused = true;
    }
  }

  seek(s) {
    if (this.current) this.position = Math.max(0, Math.min(s, this.current.seconds - 0.5));
  }

  next() {
    this.order.repeat = this.repeat();
    if (this.current) this.stats.ended(this.current);
    const n = this.order.next();
    if (n) return this.start(n, 0, true);
    if (this.order.listKey === RADIO) return;
    if (this.upcoming()) return this.playUpcoming();
    const all = this.only(this.lib.tracks).filter(t => t === this.current || !this.cfg.disliked.includes(t.id));
    if (all.length) this.play(ALL, all, (all.indexOf(this.current) + 1) % all.length);
  }

  previous() {
    const p = this.current && this.position > 3 ? null : this.order.previous();
    if (p) this.start(p, 0, true);
    else this.seek(0);
  }

  queue() {
    return this.order.queue;
  }

  startIfIdle() {
    if (!this.current || (!this.playing && !this.paused)) this.next();
  }

  enqueue(t) {
    if (!this.allows(t)) return;
    this.order.queue.push(t);
    this.startIfIdle();
  }

  enqueueAll(list) {
    this.order.queue.push(...this.only(list));
    this.startIfIdle();
  }

  unqueue(i) {
    this.order.queue.splice(i, 1);
  }

  clearQueue() {
    this.order.queue = [];
  }

  upNext(n) {
    return this.order.upNext(n);
  }

  playUpNext(k) {
    const t = this.order.jump(k);
    if (t) this.start(t, 0, true);
  }

  moveUpNext(from, to) {
    this.order.moveUpNext(from, to);
  }

  moveQueued(from, to) {
    this.order.moveQueued(from, to);
  }

  playQueued(i) {
    const t = this.order.playQueued(i);
    if (t) this.start(t, 0, true);
  }

  repeat() {
    return this.isPlayingList(RADIO) ? 'off' : this.cfg.repeat;
  }

  listNext() {
    if (this.repeat() === 'one' && this.current) return this.current;
    this.order.repeat = this.repeat();
    return this.order.listNext();
  }

  /** Dislikes or brings back {@code t}; the game skips a disliked song it's playing. Returns true if now disliked. */
  toggleDisliked(t) {
    const cfg = this.cfg, id = t.id;
    if (cfg.disliked.includes(id)) {
      cfg.disliked = cfg.disliked.filter(d => d !== id);
      return false;
    }
    cfg.disliked = [...cfg.disliked, id];
    cfg.liked = cfg.liked.filter(l => l !== id);
    if (this.current === t && !this.picked) this.next();
    if (this.planned === t) this.replan();
    return true;
  }

  modeChanged() {
    if (this.current && !this.allows(this.current)) {
      this.current = null;
      this.playing = false;
      this.paused = false;
    }
    this.order.retain(t => this.allows(t));
    this.replan(true);
  }

  // Radio: endless, picked from what you like and play through, never a disliked song.

  radioPool() {
    return this.only(this.lib.tracks);
  }

  radioPicks(n) {
    const songs = this.radioPool(), seed = this.radio.seed, picks = [], history = [...this.radio.played];
    const candidates = songs.filter(s => !this.cfg.disliked.includes(s.id));
    let last = this.order.list.at(-1) || seed;
    for (let k = 0; k < n && candidates.length; k++) {
      const window = Math.max(1, Math.floor(candidates.length * 2 / 3)), recent = new Set(history.slice(-window));
      const weights = candidates.map(c => (recent.has(c.id) || (last && c === last && candidates.length > 1) ? 0 : Math.exp(this.radioScore(c, seed, last))));
      const total = weights.reduce((a, b) => a + b, 0);
      if (total <= 0) {
        history.length = 0;
        continue;
      }
      let r = Math.random() * total, chosen = weights.length - 1;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r < 0 && weights[i] > 0) {
          chosen = i;
          break;
        }
      }
      picks.push(candidates[chosen]);
      history.push(candidates[chosen].id);
      last = candidates[chosen];
    }
    return picks;
  }

  radioScore(c, seed, last) {
    let s = 0;
    if (this.cfg.liked.includes(c.id)) s += 1.2;
    const song = this.stats.songs.get(c.id), heard = song ? song.plays + song.skips : 0;
    if (heard >= 3) s += 1.5 * (song.plays / heard - 0.5);
    else if (heard === 0) s += 0.2;
    if (seed) {
      if (c.artist && c.artist === seed.artist) s += 0.8;
      if (c.album && c.album === seed.album) s += 0.4;
    }
    if (last && c.bpm > 0 && last.bpm > 0) s += 0.8 * (1 - Math.min(1, tempoGap(c.bpm, last.bpm) / 0.12));
    if (last && c.key && last.key && keysMix(c.key, last.key)) s += 0.4;
    return s;
  }

  startRadio(seed) {
    this.radio = { seed: seed || null, played: [] };
    this.order.endList();
    const picks = seed ? [seed, ...this.radioPicks(19)] : this.radioPicks(20);
    if (picks.length) {
      this.order.setShuffle(false);
      this.cfg.listsPlayed[RADIO] = Date.now();
      this.start(this.order.play(RADIO, picks, 0), 0, true);
    }
  }

  radioSeed() {
    return this.radio.seed;
  }

  clearRadioSeed() {
    this.radio.seed = null;
    if (this.isPlayingList(RADIO)) {
      this.order.list = this.order.list.slice(0, this.order.cursor + 1);
      this.order.extendList(this.radioPicks(19));
    }
  }

  radioTracks() {
    if (!this.isPlayingList(RADIO)) return [];
    if (this.order.list.length - this.order.cursor < 10) this.order.extendList(this.radioPicks(10));
    return this.order.list;
  }

  previewTransition(key, list, index, from, until) {
    this.play(key, list, index);
    this.seek(from);
    this.previewFrom = list[index];
    this.previewTo = list[index + 1];
    this.previewUntil = until;
  }

  isPreviewing() {
    return this.previewTo != null && this.isPlaying();
  }

  stopPreview() {
    if (!this.previewTo) return;
    this.previewTo = null;
    if (this.isPlaying()) this.togglePause();
  }
}

// ------------------------------------------------------------------- stats

const DAY = 86400000;
export const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** ListeningStats, started with a few weeks of made-up listening so Your Stats has something to show. */
export class Stats {
  constructor(lib) {
    this.lib = lib;
    this.songs = new Map();
    this.days = new Map();
    this.hours = new Array(24).fill(0);
    this.dims = new Map();
    this.picked = 0;
    this.game = 0;
    this.effects = 0;
    this.heard = 0;
    let seed = 7;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const songs = lib.gameMusic(), favourites = songs.filter((_, i) => i % 5 === 1);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    this.sinceMs = today.getTime() - 120 * DAY;
    for (let d = 120; d >= 1; d--) {
      if (rand() < (d > 60 ? 0.55 : 0.25)) continue;
      const date = new Date(today.getTime() - d * DAY);
      for (let k = 1 + Math.floor(rand() * 6); k > 0; k--) {
        const t = rand() < 0.5 ? favourites[Math.floor(rand() * favourites.length)] : songs[Math.floor(rand() * songs.length)];
        const sec = t.seconds * (rand() < 0.15 ? 0.2 : 1);
        const hour = [21, 22, 20, 23, 19, 16, 13, 9][Math.floor(rand() * 8)];
        this.add(t, sec, date, hour, rand() < 0.35, rand() < 0.75 ? 'minecraft:overworld' : rand() < 0.7 ? 'minecraft:the_nether' : 'minecraft:the_end');
        if (rand() < 0.3) this.effects += sec;
      }
    }
  }

  song(id) {
    let s = this.songs.get(id);
    if (!s) this.songs.set(id, (s = { plays: 0, skips: 0, seconds: 0 }));
    return s;
  }

  add(t, sec, date, hour, picked, dim) {
    const s = this.song(t.id);
    if (sec >= 30 || sec >= t.seconds / 2) s.plays++;
    else s.skips++;
    s.seconds += sec;
    this.days.set(dayKey(date), (this.days.get(dayKey(date)) || 0) + sec);
    this.hours[hour] += sec;
    this.dims.set(dim, (this.dims.get(dim) || 0) + sec);
    if (picked) this.picked += sec;
    else this.game += sec;
  }

  // Live listening in the web player counts like the mod counts it.
  started() {
    this.heard = 0;
  }

  listen(t, dt, picked, cfg) {
    if (cfg.volume <= 0) return;
    this.heard += dt;
    if (this.heard < 3) return;
    const now = new Date(), s = this.song(t.id);
    s.seconds += dt;
    this.days.set(dayKey(now), (this.days.get(dayKey(now)) || 0) + dt);
    this.hours[now.getHours()] += dt;
    this.dims.set('minecraft:overworld', (this.dims.get('minecraft:overworld') || 0) + dt);
    if (picked) this.picked += dt;
    else this.game += dt;
    if (cfg.enabled && (cfg.pitchSemitones !== 0 || cfg.speed !== 1 || cfg.eqEnabled)) this.effects += dt;
    if (!t._counted && this.heard >= 30) {
      t._counted = true;
      s.plays++;
    }
  }

  ended(t) {
    if (!t) return;
    if (!t._counted && this.heard >= 3) this.song(t.id).skips++;
    t._counted = false;
    this.heard = 0;
  }

  isEmpty() {
    return this.totalSeconds() <= 0;
  }

  totalSeconds() {
    let n = 0;
    for (const s of this.songs.values()) n += s.seconds;
    return n;
  }

  totalPlays() {
    let n = 0;
    for (const s of this.songs.values()) n += s.plays;
    return n;
  }

  since() {
    return this.sinceMs;
  }

  top(n) {
    return [...this.songs.entries()].filter(([, s]) => s.plays > 0).sort((a, b) => b[1].plays - a[1].plays || b[1].seconds - a[1].seconds)
      .slice(0, n).map(([id]) => id);
  }

  peakHour() {
    let peak = -1, most = 0;
    this.hours.forEach((h, i) => {
      if (h > most) {
        most = h;
        peak = i;
      }
    });
    return peak;
  }

  day(date) {
    return this.days.get(dayKey(date)) || 0;
  }

  currentStreak(today) {
    let n = 0;
    const d = new Date(today);
    if (!this.day(d)) d.setDate(d.getDate() - 1);
    while (this.day(d) > 0) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  longestStreak() {
    let best = 0, run = 0;
    const d = new Date(this.sinceMs), end = Date.now();
    for (; d.getTime() <= end; d.setDate(d.getDate() + 1)) {
      run = this.day(d) > 0 ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  }

  mostSkipped() {
    let id = null, most = 1;
    for (const [k, s] of this.songs) {
      if (s.skips > most) {
        most = s.skips;
        id = k;
      }
    }
    return id;
  }

  reset() {
    this.songs.clear();
    this.days.clear();
    this.hours.fill(0);
    this.dims.clear();
    this.picked = this.game = this.effects = 0;
    this.sinceMs = Date.now();
  }
}
