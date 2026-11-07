// A page's mix and the transition editor, from CueScreen's mix section.

import { CueScreen, WHITE, DIM, FAINT, GREEN, BLACK, ROW_HOVER, time, menuItem as item } from './screen.js';
import { crossIcon, pauseIcon, playIcon, chevron, box } from './gfx.js';
import { tr, clamp, floorMod, Profile, plan, autoSeconds, stretch, tempoGap, loopFrames, volumeOut, volumeIn, bassOut, bassIn,
  filterOut, filterIn, lowPassOut, PRESETS, VOLUME, EQ, FILTER, EFFECT, LOOP, AUTO, WAVE_RATE } from './model.js';

const WAVE_LOW = 0xFF2F6BFF, WAVE_MID = 0xFFFF8A2A, WAVE_HIGH = 0xFFF2F2F2, CURVE_VOLUME = 0xFF8CCBFF, CURVE_EQ = 0xFFFFD84A,
  CURVE_FILTER = 0xFFE98AF0, CURVE_LOOP = 0xFFF5A623, CURVE_EFFECT = 0xFFBDBDBD;

const profiles = new Map();
const sameTransition = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function wheelColour(n, minor) {
  const h = ((n - 1) % 12) / 12, s = minor ? 0.55 : 0.4, v = minor ? 0.9 : 1;
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), u = v * (1 - (1 - f) * s);
  const rgb = [[v, u, p], [q, v, p], [p, v, u], [p, q, v], [u, p, v], [v, p, q]][i % 6];
  return (0xFF000000 | Math.round(rgb[0] * 255) << 16 | Math.round(rgb[1] * 255) << 8 | Math.round(rgb[2] * 255)) >>> 0;
}

function shade(argb, f) {
  const r = Math.floor(((argb >> 16) & 0xFF) * f), g = Math.floor(((argb >> 8) & 0xFF) * f), b = Math.floor((argb & 0xFF) * f);
  return (0xFF000000 | r << 16 | g << 8 | b) >>> 0;
}

/** The loudest point of one waveform band over {@code step} seconds from {@code seconds}. */
function band(wave, seconds, step) {
  const i0 = Math.floor(seconds * WAVE_RATE), i1 = Math.ceil((seconds + step) * WAVE_RATE);
  let most = 0;
  for (let i = Math.max(0, i0); i < Math.min(wave.length, Math.max(i0 + 1, i1)); i++) most = Math.max(most, wave[i]);
  return most;
}

const beatOr = p => (p.bpm > 0 ? p.beat : 0.5);
const onBeat = (p, s) => (p.hasBars ? p.downbeat + Math.round((s - p.downbeat) / p.beat) * p.beat : s);
const timeX = (s, t0, span, x0, x1) => x0 + Math.round((s - t0) / span * (x1 - x0));

/** One column of a curve at {@code y}, joined to the last column's {@code last}. Returns {@code y}. */
function curve(g, x, y, last, thick, color) {
  const from = last < 0 ? y : last;
  g.fill(x, Math.min(y, from), x + 1, Math.max(y, from) + thick, color);
  return y;
}

const presetName = p => tr('cuemymusic.mix.preset.' + p);
const partName = (part, value) => tr('cuemymusic.mix.' + part + '.' + value);
const fmt1 = v => v.toFixed(1).replace('.0', '');

Object.assign(CueScreen.prototype, {
  /** Whether the song is mixed: an add-on's, with Automix on. The game's own play as they are. */
  applies(t) {
    return !!t && this.cfg.automix && t.packId !== null;
  },

  profile(t) {
    let p = profiles.get(t.id);
    if (!p) profiles.set(t.id, (p = new Profile(t)));
    return p;
  },

  /** True if songs {@code i} and {@code i + 1} of {@code tracks} blend. */
  blends(tracks, i) {
    const a = tracks[i], b = tracks[i + 1];
    return this.applies(a) && this.applies(b) && a !== b;
  },

  savedTransition(from, to) {
    return this.cfg.transitions[from + '>' + to] || AUTO;
  },

  /** The songs in order, each with its tempo and key, and the transition between each pair that blends. */
  drawMix(g, x0, y, x1, mx, my, listKey) {
    const tracks = this.mixTracks, font = this.font;
    let transitions = 0;
    for (let i = 0; i + 1 < tracks.length; i++) if (this.blends(tracks, i)) transitions++;
    const left = x0 + 10, right = x1 - 10;
    // Every pair is either a transition or a cut, so the numbers add up.
    const cuts = Math.max(0, tracks.length - 1 - transitions);
    const summary = cuts === 0 ? tr('cuemymusic.mix.summary', tracks.length, transitions) : tr('cuemymusic.mix.summary_cuts', tracks.length, transitions, cuts);
    g.text(this.clip(summary, right - left), left, y, DIM);
    y += 16;

    // Songs, and between two that blend a line down with the transition's pill.
    const rowH = 30, art = 24, lineX = left + art / 2;
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const hover = mx >= left - 4 && mx < right + 4 && my >= y && my < y + rowH && my >= this.centerY0 && my < this.centerY1;
      if (hover) box(g, left - 4, y, right + 4, y + rowH, ROW_HOVER);
      this.art(g, t.art, left, y + 3, art);
      const current = t === this.player.current, textRight = right - this.mixRowInfo(g, t, right, y + 11), mixes = this.applies(t);
      g.text(this.clip(t.title, textRight - left - art - 16), left + art + 8, y + 5, current ? GREEN : mixes ? WHITE : FAINT);
      g.text(this.clip(t.artist, textRight - left - art - 16), left + art + 8, y + 17, mixes ? DIM : FAINT);
      const top = Math.max(y, this.centerY0), bottom = Math.min(y + rowH, this.centerY1);
      if (bottom > top) {
        this.hit(left - 4, top, right + 4, bottom, () => this.player.play(listKey, tracks, i));
        this.nextRowHits.push({ x0: left - 4, y0: top, x1: right + 4, y1: bottom, track: t, index: i });
      }
      y += rowH;
      if (i + 1 >= tracks.length) break;
      if (!this.blends(tracks, i)) {
        y += 4;
        continue;
      }
      const gap = 22;
      g.fill(lineX, y, lineX + 1, y + gap, 0xFF3A3A3A);
      const from = t.id, to = tracks[i + 1].id, tn = this.savedTransition(from, to);
      let label = presetName(tn.preset);
      if (tn.preset === 'auto') label = '✦ ' + label + ' · ' + presetName(plan(this.profile(t), this.profile(tracks[i + 1]), tn).preset);
      label += '  ›';
      const w = font.width(label) + 14, cx = lineX + 10, cy = y + 4;
      const chipHover = mx >= cx && mx < cx + w && my >= cy && my < cy + 14 && my >= this.centerY0 && my < this.centerY1;
      box(g, cx, cy, cx + w, cy + 14, chipHover ? 0xFF3A3A3A : 0xFF262626);
      g.text(label, cx + 7, cy + 3, chipHover ? WHITE : DIM);
      this.hit(cx, cy, cx + w, cy + 14, () => this.openTransition(from, to));
      y += gap;
    }
    if (!this.cfg.automix) {
      y += 6;
      g.text(this.clip(tr('cuemymusic.mix.off.hint'), right - left), left, y, DIM);
      y += 14;
    }
    return y + 10;
  },

  /** A song's tempo, key and length at the right of its row, ending at {@code right}. Returns their width. */
  mixRowInfo(g, t, right, y) {
    const length = t.seconds ? time(t.seconds) : '';
    let x = right - this.font.width(length);
    g.text(length, x, y, DIM);
    const p = this.applies(t) ? this.profile(t) : null;
    if (!p) return right - x + 8;
    x -= 10;
    if (p.key) x -= this.keyBadge(g, p.key, x, y - 3, true) + 6;
    if (p.bpm > 0) {
      const bpm = tr('cuemymusic.mix.bpm', Math.round(p.bpm));
      x -= this.font.width(bpm);
      g.text(bpm, x, y, FAINT);
    }
    return right - x + 8;
  },

  /** A Camelot key ("5A") in a badge coloured by its place on the wheel, so keys that mix well look alike. Returns its width. */
  keyBadge(g, key, x, y, alignRight) {
    const w = this.font.width(key) + 8;
    if (alignRight) x -= w;
    const n = parseInt(key) || 1, minor = key.endsWith('A');
    g.fill(x + 1, y, x + w - 1, y + 13, wheelColour(n, minor));
    g.fill(x, y + 1, x + w, y + 12, wheelColour(n, minor));
    g.text(key, x + 4, y + 3, BLACK);
    return w;
  },

  /** Opens the editor on the transition from song {@code from} into {@code to}, as a draft of what's saved. */
  openTransition(from, to) {
    this.mixFrom = from;
    this.mixTo = to;
    this.mixDraft = this.savedTransition(from, to);
    this.presetScroll = 0;
  },

  /** Closes the editor; anything not saved is dropped. */
  closeTransition() {
    if (this.mixFrom != null) this.player.stopPreview();
    this.mixFrom = this.mixTo = null;
    this.mixDraft = null;
    this.laneDrag = 0;
  },

  /** Changes the draft, which is what plays while the editor is open. */
  editDraft(change) {
    if (!this.mixDraft || this.mixFrom == null) return;
    this.mixDraft = change(this.mixDraft);
  },

  hovered(x0, y0, x1, y1, mx, my) {
    return mx >= x0 && mx < x1 && my >= y0 && my < y1 && my >= this.centerY0 && my < this.centerY1;
  },

  /**
   * The editor for transition {@link #mixEdit}: close, Beta, more and Save along the top; both songs' waveforms with the
   * transition marked and its curves over them, a preview button between them and its length under them; the presets;
   * and the parts, each a drop-down, with beatmatching. Changes are a draft until Save.
   */
  drawTransitionEditor(g, x0, y, x1, mx, my, listKey) {
    const a = this.mixTracks[this.mixEdit], b = this.mixTracks[this.mixEdit + 1], from = a.id, to = b.id, font = this.font;
    if (!this.mixDraft) this.openTransition(from, to);
    const t = this.mixDraft, left = x0 + 12, right = x1 - 12;

    // Top bar.
    const bar = 18;
    box(g, left, y, left + bar, y + bar, this.hovered(left, y, left + bar, y + bar, mx, my) ? 0xFF3A3A3A : 0xFF2A2A2A);
    crossIcon(g, left + 6, y + 6, WHITE);
    this.hit(left, y, left + bar, y + bar, () => this.closeTransition());
    const dirty = !sameTransition(t, this.savedTransition(from, to));
    const save = tr('cuemymusic.mix.save'), sw = font.width(save) + 20, sx = right - sw;
    box(g, sx, y, right, y + bar, dirty && this.hovered(sx, y, right, y + bar, mx, my) ? 0xFF333333 : 0xFF262626);
    g.text(save, sx + 10, y + 5, dirty ? GREEN : 0xFF2C5E3E);
    this.hit(sx, y, right, y + bar, () => {
      if (!dirty) return;
      const transitions = { ...this.cfg.transitions };
      if (sameTransition(this.mixDraft, AUTO)) delete transitions[from + '>' + to];
      else transitions[from + '>' + to] = this.mixDraft;
      this.cfg.transitions = transitions;
      this.closeTransition();
      this.showToast(tr('cuemymusic.mix.saved'));
    });
    const ox = sx - 6 - bar;
    box(g, ox, y, ox + bar, y + bar, this.hovered(ox, y, ox + bar, y + bar, mx, my) ? 0xFF3A3A3A : 0xFF2A2A2A);
    for (let i = 0; i < 3; i++) g.fill(ox + 4 + i * 4, y + 8, ox + 6 + i * 4, y + 10, WHITE);
    const menuY = y + bar + 2;
    this.hit(ox, y, ox + bar, y + bar, () => this.showMenu({ x: ox, y: menuY, items: [item('none', tr('cuemymusic.mix.reset'), () => this.editDraft(() => AUTO))] }));
    const beta = tr('cuemymusic.mix.beta'), bw = font.width(beta) + 8, bx = ox - 6 - bw;
    box(g, bx, y + 4, bx + bw, y + 15, 0xFF5E5E5E);
    g.text(beta, bx + 4, y + 6, 0xFF1A1A1A);
    y += bar + 12;

    const pa = this.profile(a), pb = this.profile(b), pl = plan(pa, pb, t), shape = pl.shape;

    // The two songs, edge to edge, centred on the transition.
    const aEnd = pa.seconds(pa.end), start = pa.seconds(pl.fadeStart), len = pa.seconds(pl.fadeFrames);
    const enter = pb.seconds(pl.enterAt), st = pl.stretch;
    const span = Math.max(10, len * 1.5), t0 = start + len / 2 - span / 2;
    const laneH = 40, gapH = 16, laneA = y, laneB = laneA + laneH + gapH, boxBottom = laneB + laneH + 8, wx0 = x0, wx1 = x1;
    const ox0 = timeX(start, t0, span, wx0, wx1), ox1 = timeX(start + len, t0, span, wx0, wx1);
    box(g, ox0, laneA - 4, ox1, boxBottom, 0xFF262626);
    // Beat lines across the transition, brighter on each bar.
    if (pa.bpm > 0) {
      const beat = pa.beat, origin = pa.hasBars ? pa.downbeat : start;
      for (let k = Math.ceil((start - origin) / beat); origin + k * beat <= start + len; k++) {
        const x = timeX(origin + k * beat, t0, span, wx0, wx1);
        g.fill(x, laneA - 4, x + 1, boxBottom - 4, floorMod(k, 4) === 0 ? 0x30FFFFFF : 0x12FFFFFF);
      }
    }
    this.drawLane(g, pa, shape, true, start, len, t0, span, start, 1, wx0, laneA, wx1, laneH, ox0, ox1);
    this.drawLane(g, pb, shape, false, start, len, t0, span, enter, st, wx0, laneB, wx1, laneH, ox0, ox1);
    if (shape.loop === 'loop_out') {
      // The bar that repeats, marked over the first song.
      const lx = timeX(start + pa.seconds(loopFrames(pa, pl.fadeFrames)), t0, span, wx0, wx1);
      g.fill(ox0, laneA - 2, lx, laneA, CURVE_LOOP);
      g.fill(lx - 1, laneA - 2, lx, laneA + 4, CURVE_LOOP);
    }
    // Where the music is now, if it's in this stretch.
    const now = this.player.current;
    const nowTau = now === a ? this.player.position : now === b ? start + (this.player.position - enter) / st : NaN;
    if (nowTau >= t0 && nowTau <= t0 + span) {
      const px = timeX(nowTau, t0, span, wx0, wx1);
      g.fill(px, laneA - 4, px + 1, laneB + laneH + 4, WHITE);
    }
    // Preview, between the songs: just the transition, from a few seconds before it to a few after, then it pauses.
    const pw = 26, ph = 16, pbx = Math.floor((ox0 + ox1) / 2 - pw / 2), pby = laneA + laneH + gapH / 2 - ph / 2;
    const previewing = this.player.isPreviewing(), until = enter + len * st + 4;
    box(g, pbx, pby, pbx + pw, pby + ph, this.hovered(pbx, pby, pbx + pw, pby + ph, mx, my) ? 0xFF4A4A4A : 0xFF383838);
    if (previewing) pauseIcon(g, pbx + 10, pby + 4, 8, WHITE);
    else playIcon(g, pbx + 11, pby + 4, 8, WHITE);
    const edit = this.mixEdit, tracks = this.mixTracks;
    this.hit(pbx, pby, pbx + pw, pby + ph, () => {
      if (previewing) this.player.stopPreview();
      else if (this.cfg.automix) this.player.previewTransition(listKey, tracks, edit, Math.max(0, start - 5), until);
      else this.showToast(tr('cuemymusic.mix.off.hint'));
    });
    // Its length, on the transition's bottom edge.
    const cut = shape.volume === 'cut', barSeconds = pa.bpm > 0 ? 240 / pa.bpm : 0;
    const lengthText = sec => (barSeconds > 0
      ? tr(Math.abs(sec / barSeconds - 1) < 0.05 ? 'cuemymusic.mix.bar' : 'cuemymusic.mix.bars', fmt1(sec / barSeconds))
      : tr('cuemymusic.mix.seconds', fmt1(sec)));
    const lenLabel = lengthText(len), lw = font.width(lenLabel) + 22, lx = Math.floor((ox0 + ox1) / 2 - lw / 2), ly = boxBottom - 8;
    box(g, lx, ly, lx + lw, ly + 16, this.hovered(lx, ly, lx + lw, ly + 16, mx, my) ? 0xFF3A3A3A : 0xFF2E2E2E);
    g.text(lenLabel, lx + 8, ly + 4, WHITE);
    chevron(g, lx + lw - 11, ly + 7, WHITE);
    const most = cut ? 4 : 40, autoLen = cut ? 1 : autoSeconds(pa, shape, pl.preset);
    this.hit(lx, ly, lx + lw, ly + 16, () => {
      const items = [item('none', (t.seconds < 0 ? '✔ ' : '    ') + tr('cuemymusic.mix.auto_value', lengthText(autoLen)),
        () => this.editDraft(d => ({ ...d, seconds: -1 })))];
      for (const n of barSeconds > 0 ? [1, 2, 4, 8, 16] : [2, 4, 8, 15, 30]) {
        const sec = Math.round((barSeconds > 0 ? n * barSeconds : n) * 100) / 100;
        if (sec > most) continue;
        items.push(item('none', (t.seconds >= 0 && Math.abs(t.seconds - sec) < 0.05 ? '✔ ' : '    ') + lengthText(sec),
          () => this.editDraft(d => ({ ...d, seconds: sec }))));
      }
      this.showMenu({ x: lx, y: ly + 18, items });
    });
    // Dragging or scrolling sideways over a song moves it, a beat at a time: the first song moves where the
    // transition starts, the next one where it comes in.
    this.mixLaneX0 = wx0;
    this.mixLaneY0 = Math.max(laneA - 4, this.centerY0);
    this.mixLaneX1 = wx1;
    this.mixLaneY1 = Math.min(laneB + laneH, this.centerY1);
    this.mixLaneSplit = laneA + laneH + gapH / 2;
    this.mixLaneSpp = span / (wx1 - wx0);
    this.mixLaneValueA = aEnd - start;
    this.mixLaneValueB = enter;
    const bLength = pb.seconds(pb.frames);
    this.mixLaneSetA = sbe => {
      const at = onBeat(pa, aEnd - sbe);
      this.editDraft(d => ({ ...d, startBeforeEnd: clamp(Math.round((aEnd - at) * 100) / 100, 0, 60) }));
    };
    this.mixLaneSetB = e => {
      const at = onBeat(pb, e);
      this.editDraft(d => ({ ...d, enterAt: clamp(Math.round(at * 100) / 100, 0, Math.max(0, bLength - 1)) }));
    };
    this.nextMixLaneScroll = steps => this.mixLaneSetA(aEnd - start + steps * beatOr(pa));
    this.nextMixLaneScrollNext = steps => this.mixLaneSetB(enter + steps * beatOr(pb));
    y = boxBottom + 18;

    // Presets, in a row that scrolls sideways.
    const presets = tr('cuemymusic.mix.presets'), pwText = font.width(presets), mid = Math.floor((left + right) / 2);
    g.fill(left, y + 4, mid - Math.floor(pwText / 2) - 8, y + 5, 0xFF2A2A2A);
    g.fill(mid + Math.floor(pwText / 2) + 8, y + 4, right, y + 5, 0xFF2A2A2A);
    g.text(presets, mid - Math.floor(pwText / 2), y, DIM);
    y += 16;
    const rowH = 22, gap = 6, each = Math.max(52, Math.floor((right - left - 3 * gap) / 3.6));
    const total = PRESETS.length * (each + gap) - gap;
    this.presetScrollMax = Math.max(0, total - (right - left));
    this.presetScroll = clamp(this.presetScroll, 0, this.presetScrollMax);
    this.presetX0 = left;
    this.presetX1 = right;
    this.presetY0 = y;
    this.presetY1 = y + rowH;
    g.enableScissor(left, Math.max(y, this.centerY0), right, Math.min(y + rowH, this.centerY1));
    PRESETS.forEach((p, i) => {
      const bx0 = left + i * (each + gap) - Math.floor(this.presetScroll), bx1 = bx0 + each;
      if (bx1 < left || bx0 > right) return;
      const on = t.preset === p, hover = this.hovered(Math.max(bx0, left), y, Math.min(bx1, right), y + rowH, mx, my);
      box(g, bx0, y, bx1, y + rowH, on ? WHITE : hover ? 0xFF333333 : 0xFF242424);
      const label = (p === 'auto' ? '✦ ' : '') + presetName(p);
      g.text(this.clip(label, each - 8), bx0 + Math.floor((each - Math.min(font.width(label), each - 8)) / 2), y + 7, on ? BLACK : WHITE);
      this.hit(Math.max(bx0, left), y, Math.min(bx1, right), y + rowH, () => this.editDraft(d => ({ ...d, preset: p, shape: null })));
    });
    g.disableScissor();
    y += rowH + 12;

    // The parts, each a drop-down; changing one makes the transition custom.
    const part = (color, label, kind, value, choices) => {
      y = this.partRow(g, left, y, right, mx, my, color, label, kind, value, choices, v => ({ ...shape, [kind]: v }));
    };
    part(CURVE_VOLUME, tr('cuemymusic.mix.part.volume'), 'volume', shape.volume, VOLUME);
    part(CURVE_EQ, tr('cuemymusic.mix.part.eq'), 'eq', shape.eq, EQ);
    part(CURVE_FILTER, tr('cuemymusic.mix.part.filter'), 'filter', shape.filter, FILTER);
    part(CURVE_EFFECT, tr('cuemymusic.mix.part.effects'), 'effect', shape.effect, EFFECT);
    part(CURVE_LOOP, tr('cuemymusic.mix.part.looping'), 'loop', shape.loop, LOOP);

    // Beatmatching: on unless turned off, when the tempos are known and close enough to meet.
    y += 6;
    g.text(tr('cuemymusic.mix.part.beatmatch'), left, y + 4, WHITE);
    const canStretch = stretch(pa, pb), known = pa.bpm > 0 && pb.bpm > 0;
    const inTime = known && tempoGap(pa.bpm, pb.bpm) < 0.002, available = known && (canStretch !== 1 || inTime) && !cut;
    const on = available && !t.beatmatchOff;
    const tw = 24, th = 12, tx = right - tw, ty = y + 2;
    box(g, tx, ty, tx + tw, ty + th, on ? GREEN : available ? 0xFF4D4D4D : 0xFF2E2E2E);
    const knob = on ? tx + tw - th + 1 : tx + 1;
    box(g, knob, ty + 1, knob + th - 2, ty + th - 1, available ? WHITE : 0xFF6A6A6A);
    let note = !known ? tr('cuemymusic.mix.beatmatch.unknown') : cut ? tr('cuemymusic.mix.beatmatch.cut')
      : !available ? tr('cuemymusic.mix.beatmatch.too_far') : inTime ? tr('cuemymusic.mix.beatmatch.in_time')
      : on ? tr('cuemymusic.mix.beatmatch.speed', ((canStretch - 1) * 100 >= 0 ? '+' : '') + ((canStretch - 1) * 100).toFixed(1)) : '';
    if (note) {
      note = this.clip(note, tx - left - font.width(tr('cuemymusic.mix.part.beatmatch')) - 20);
      g.text(note, tx - 8 - font.width(note), y + 4, FAINT);
    }
    if (available) this.hit(tx - 4, y, tx + tw + 4, y + 16, () => this.editDraft(d => ({ ...d, beatmatchOff: !d.beatmatchOff })));
    return y + 30;
  },

  /**
   * One song's lane: its waveform in three colours, dimmed outside the transition, with its curves over the
   * transition. Song time at timeline time {@code tau} is {@code origin + (tau - start) * rate}.
   */
  drawLane(g, p, shape, outgoing, start, len, t0, span, origin, rate, x0, y, x1, h, rx0, rx1) {
    const mid = y + Math.floor(h / 2), half = Math.floor(h / 2) - 1, step = span / (x1 - x0);
    const filtered = outgoing ? lowPassOut(shape.filter) : shape.filter !== 'none' && shape.filter !== 'fall';
    let lastVol = -1, lastEq = -1, lastFilter = -1;
    for (let x = x0; x < x1; x++) {
      const tau = t0 + (x - x0 + 0.5) * step, songT = origin + (tau - start) * rate, prog = (tau - start) / len;
      const inside = x >= rx0 && x < rx1;
      if (songT < 0 || songT > p.seconds(p.frames)) continue;
      const vol = outgoing ? (prog <= 0 ? 1 : volumeOut(shape, prog)) : (prog <= 0 ? 0 : volumeIn(shape, prog));
      const lo = band(p.low, songT, step * rate), md = band(p.mid, songT, step * rate), hi = band(p.high, songT, step * rate);
      const f = inside ? 0.55 + 0.45 * Math.max(vol, 0) : 0.38;
      // Bass widest and behind, the mids over it, the highs on top as a thin core.
      const hl = Math.floor(Math.min(half, lo * half * 1.3)), hm = Math.floor(Math.min(half, md * half * 1.2)), hh = Math.floor(Math.min(half, hi * half * 1.6));
      if (hl > 0) g.fill(x, mid - hl, x + 1, mid + hl + 1, shade(WAVE_LOW, f));
      if (hm > 0) g.fill(x, mid - hm, x + 1, mid + hm + 1, shade(WAVE_MID, f));
      if (hh > 0) g.fill(x, mid - Math.floor(hh / 2), x + 1, mid + Math.floor(hh / 2) + 1, shade(WAVE_HIGH, f));
      if (!inside) continue;
      const p01 = clamp(prog, 0, 1);
      lastVol = curve(g, x, y + h - 2 - Math.round(vol * (h - 4)), lastVol, 2, CURVE_VOLUME);
      if (shape.eq !== 'none') {
        const bass = outgoing ? bassOut(shape, p01) : bassIn(shape, p01);
        lastEq = curve(g, x, y + h - 2 - Math.round(bass * (h - 4)), lastEq, 1, CURVE_EQ);
      }
      if (filtered) {
        const open = outgoing ? filterOut(shape, p01) : filterIn(shape, p01);
        lastFilter = curve(g, x, y + h - 2 - Math.round(open * (h - 4)), lastFilter, 1, CURVE_FILTER);
      }
    }
  },

  /** A row with a coloured mark, a part's name, and its value as a drop-down of the choices. */
  partRow(g, left, y, right, mx, my, color, label, kind, value, choices, withValue) {
    const h = 24, hover = this.hovered(left - 4, y, right + 4, y + h, mx, my);
    if (hover) box(g, left - 4, y, right + 4, y + h, 0xFF1C1C1C);
    g.fill(left, y + 6, left + 2, y + h - 6, color);
    g.text(label, left + 10, y + 8, WHITE);
    const shown = this.clip(partName(kind, value), right - 12 - (left + 20 + this.font.width(label)));
    g.text(shown, right - 12 - this.font.width(shown), y + 8, hover ? WHITE : DIM);
    chevron(g, right - 7, y + 10, hover ? WHITE : DIM);
    const top = Math.max(y, this.centerY0), bottom = Math.min(y + h, this.centerY1), menuX = Math.max(left, right - 150);
    if (bottom > top) {
      this.hit(left - 4, top, right + 4, bottom, () => this.showMenu({ x: menuX, y: y + h, items: choices.map(c =>
        item('none', (c === value ? '✔ ' : '    ') + partName(kind, c), () => this.editDraft(d => ({ ...d, preset: 'custom', shape: withValue(c) })))) }));
    }
    return y + h + 2;
  },

  /** A small rounded label button. Returns its width. */
  chip(g, x, y, label, on, mx, my, click) {
    const w = this.font.width(label) + 12;
    const hover = mx >= x && mx < x + w && my >= y && my < y + 13 && my >= this.centerY0 && my < this.centerY1;
    g.fill(x, y, x + w, y + 13, on ? WHITE : hover ? 0xFF3A3A3A : 0xFF2A2A2A);
    g.text(label, x + 6, y + 3, on ? BLACK : WHITE);
    const top = Math.max(y, this.centerY0), bottom = Math.min(y + 13, this.centerY1);
    if (bottom > top) this.hit(x, top, x + w, bottom, click);
    return w;
  },
});
