// Settings, now playing, the queue and the bottom bar, from CueScreen.

import { CueScreen, WHITE, DIM, FAINT, GREEN, RED, BLACK, ROW_HOVER, TRACK_BG, GAP, ROW, QROW, signed, time } from './screen.js';
import { heartIcon, dislikeIcon, crossIcon, shuffleIcon, previousIcon, nextIcon, roundButton, pauseIcon, playIcon, repeatIcon,
  speakerIcon, applyingIcon as ring } from './gfx.js';
import { tr, clamp, SONG_GAPS, RADIO, ALL } from './model.js';

/** EQ presets, in dB for each band. */
const PRESETS = {
  flat: [0, 0, 0, 0, 0, 0], bass_booster: [6, 4, 1.5, 0, 0, 0], bass_reducer: [-6, -4, -1.5, 0, 0, 0], treble_booster: [0, 0, 0, 1.5, 4, 6],
  treble_reducer: [0, 0, 0, -1.5, -4, -6], vocal_booster: [-2, -1, 1, 4, 3, 0], small_speakers: [-6, -2, 1, 2, 2, -1],
};
const FREQUENCIES = [60, 150, 400, 1000, 2400, 15000], MAX_GAIN_DB = 12;
/** How long a pitch, speed or EQ change takes to reach the speakers: the audio already buffered ahead. */
const APPLY_MILLIS = 700;

const frequencyLabel = hz => (hz >= 1000 ? (hz % 1000 === 0 ? hz / 1000 + 'k' : (hz / 1000).toFixed(1) + 'k') : String(hz));
const applyingIcon = (g, x, y, progress) => ring(g, x, y, progress, { GREEN, WHITE, FAINT });

/** "Game's Frequency", "None", "15 s" or "2 min". */
function gapLabel(seconds) {
  if (seconds < 0) return tr('cuemymusic.option.gap.frequency');
  if (seconds === 0) return tr('cuemymusic.option.gap.none');
  return seconds < 60 ? tr('cuemymusic.option.gap.seconds', seconds) : tr('cuemymusic.option.gap.minutes', Math.floor(seconds / 60));
}

Object.assign(CueScreen.prototype, {
  // ------------------------------------------------------------- settings

  /** How far a pitch, speed or EQ change has got to the speakers, 0 to 1, or -1 once it's heard. */
  applying(part) {
    const cfg = this.cfg, now = Date.now(), params = { pitch: cfg.pitchSemitones, speed: cfg.speed, eq: cfg.eqEnabled + cfg.eqGains.join() };
    this.heard ??= { ...params, at: {} };
    for (const k of Object.keys(params)) {
      if (params[k] !== this.heard[k]) {
        this.heard[k] = params[k];
        this.heard.at[k] = now;
      }
    }
    const progress = k => (this.player.isPlaying() && now - (this.heard.at[k] || 0) < APPLY_MILLIS ? (now - this.heard.at[k]) / APPLY_MILLIS : -1);
    return part ? progress(part) : Math.max(...Object.keys(params).map(progress));
  },

  drawSettings(g, x0, y, x1, mx, my) {
    const cfg = this.cfg, font = this.font, left = x0 + 12, right = x1 - 12;
    this.bigText(g, tr('cuemymusic.settings'), left, y + 10, 2, WHITE);
    y += 36;

    // The mode first: everything below depends on it.
    g.text(tr('cuemymusic.settings.mode'), left, y, WHITE);
    y += 14;
    y = this.drawModeSwitch(g, left, y, right, mx, my);
    y = this.drawModeKey(g, left, y + 4, right, mx, my);
    y = this.toggleRow(g, left, y, right, tr('cuemymusic.option.mode_cycle'), tr('cuemymusic.option.mode_cycle.desc'), cfg.modeKeyCyclesAll,
      () => (cfg.modeKeyCyclesAll = !cfg.modeKeyCyclesAll));
    y += 10;

    g.text(tr('cuemymusic.settings.playback'), left, y, WHITE);
    y += 14;
    if (this.mode() === 'fx') y = this.drawSongGap(g, left, y, right);
    y = this.toggleRow(g, left, y, right, tr('cuemymusic.option.enabled'), tr('cuemymusic.option.enabled.desc'), cfg.enabled,
      () => (cfg.enabled = !cfg.enabled));
    y = this.sliderRow(g, left, y, right, tr('cuemymusic.option.pitch'), tr('cuemymusic.option.pitch.value', signed(cfg.pitchSemitones)),
      (cfg.pitchSemitones + 12) / 24, f => (cfg.pitchSemitones = Math.round(f * 24) - 12), 0.5, this.applying('pitch'));
    y = this.sliderRow(g, left, y, right, tr('cuemymusic.option.speed'), tr('cuemymusic.option.speed.value', cfg.speed.toFixed(2)),
      (cfg.speed - 0.5) / 1.5, f => (cfg.speed = Math.round((0.5 + f * 1.5) * 20) / 20), (1 - 0.5) / 1.5, this.applying('speed'));
    y = this.toggleRow(g, left, y, right, tr('cuemymusic.option.travel'), tr('cuemymusic.option.travel.desc'), cfg.pauseOnTravel,
      () => (cfg.pauseOnTravel = !cfg.pauseOnTravel));
    y = this.toggleRow(g, left, y, right, tr('cuemymusic.option.focus'), tr('cuemymusic.option.focus.desc'), cfg.pauseOnLostFocus,
      () => (cfg.pauseOnLostFocus = !cfg.pauseOnLostFocus));
    y = this.sliderRow(g, left, y, right, tr('cuemymusic.option.crossfade'),
      cfg.crossfadeSeconds === 0 ? tr('cuemymusic.option.crossfade.off') : tr('cuemymusic.option.crossfade.value', cfg.crossfadeSeconds),
      cfg.crossfadeSeconds / 12, f => (cfg.crossfadeSeconds = Math.round(f * 12)), 4 / 12, -1);
    y = this.toggleRow(g, left, y, right, tr('cuemymusic.option.skip_blend'), tr('cuemymusic.option.skip_blend.desc'), cfg.skipWithTransition,
      () => (cfg.skipWithTransition = !cfg.skipWithTransition));
    y = this.toggleRow(g, left, y, right, tr('cuemymusic.option.autoplay'), tr('cuemymusic.option.autoplay.desc'), cfg.autoplay,
      () => (cfg.autoplay = !cfg.autoplay));
    y += 10;

    g.text(tr('cuemymusic.settings.equalizer'), left, y, WHITE);
    const eqApplying = this.applying('eq');
    if (eqApplying >= 0) applyingIcon(g, left + font.width(tr('cuemymusic.settings.equalizer')) + 5, y, eqApplying);
    y += 14;
    y = this.toggleRow(g, left, y, right, tr('cuemymusic.option.eq'), tr('cuemymusic.option.eq.desc'), cfg.eqEnabled,
      () => (cfg.eqEnabled = !cfg.eqEnabled));

    // Preset chips, wrapping onto new lines as needed.
    let cx = left;
    for (const [key, gains] of Object.entries(PRESETS)) {
      const label = tr('cuemymusic.eq.preset.' + key), w = font.width(label) + 12;
      if (cx + w > right) {
        cx = left;
        y += 16;
      }
      const on = key === cfg.eqPreset, hover = mx >= cx && mx < cx + w && my >= y && my < y + 13;
      g.fill(cx, y, cx + w, y + 13, on ? WHITE : hover ? 0xFF3A3A3A : 0xFF2A2A2A);
      g.text(label, cx + 6, y + 3, on ? BLACK : WHITE);
      this.hit(cx, y, cx + w, y + 13, () => {
        cfg.eqGains = [...gains];
        cfg.eqPreset = key;
        cfg.eqEnabled = true;
      });
      cx += w + 4;
    }
    y += 22;

    // Band sliders.
    const bands = FREQUENCIES.length, areaW = Math.min(right - left, 260), slotW = Math.floor(areaW / bands), sliderH = 64;
    const dimColor = cfg.eqEnabled ? WHITE : FAINT;
    g.text('+12', left, y, FAINT);
    g.text('-12', left, y + sliderH - 8, FAINT);
    for (let b = 0; b < bands; b++) {
      const cxm = left + 18 + b * slotW + Math.floor(slotW / 2), ty = y, by = y + sliderH, mid = Math.floor((ty + by) / 2);
      g.fill(cxm - 1, ty, cxm + 1, by, TRACK_BG);
      g.fill(cxm - 3, mid, cxm + 3, mid + 1, FAINT);
      const gain = cfg.eqGains[b], f = (gain + MAX_GAIN_DB) / (2 * MAX_GAIN_DB), ky = by - Math.round(f * (by - ty));
      if (cfg.eqEnabled && gain !== 0) g.fill(cxm - 1, Math.min(ky, mid), cxm + 1, Math.max(ky, mid), GREEN);
      g.fill(cxm - 4, ky - 2, cxm + 4, ky + 2, dimColor);
      const label = frequencyLabel(FREQUENCIES[b]);
      g.text(label, cxm - Math.floor(font.width(label) / 2), by + 5, DIM);
      this.drag(cxm - Math.floor(slotW / 2) + 2, ty - 3, cxm + Math.floor(slotW / 2) - 2, by + 3, true, v => {
        const gains = [...cfg.eqGains];
        gains[b] = Math.round((v * 2 - 1) * MAX_GAIN_DB * 2) / 2;
        cfg.eqGains = gains;
        cfg.eqPreset = 'custom';
        cfg.eqEnabled = true;
      }, () => {});
    }
    return y + sliderH + 18;
  },

  /** The mode key: what it's bound to, a button that opens the game's Controls to change it, and what it does. */
  drawModeKey(g, left, y, right, mx, my) {
    const font = this.font, bound = tr('cuemymusic.option.mode_key.unbound'), change = tr('cuemymusic.option.mode_key.change');
    g.text(tr('cuemymusic.option.mode_key'), left, y + 1, WHITE);
    const desc = tr(this.cfg.modeKeyCyclesAll ? 'cuemymusic.option.mode_key.desc_all' : 'cuemymusic.option.mode_key.desc');
    const cw = font.width(change) + 12, cx = right - cw;
    g.text(this.clip(desc, cx - left - font.width(bound) - 16), left, y + 11, DIM);
    g.text(bound, cx - 8 - font.width(bound), y + 6, FAINT);
    const hover = mx >= cx && mx < right && my >= y + 2 && my < y + 17;
    g.fill(cx, y + 2, right, y + 17, hover ? 0xFF3A3A3A : 0xFF2A2A2A);
    g.text(change, cx + 6, y + 6, WHITE);
    // The game's Controls aren't here.
    this.hit(cx, y + 2, right, y + 17, () => this.showToast(tr('cuemymusic.option.mode_key.change')));
    return y + 24;
  },

  /** Vanilla + FX's time between the game's songs: the game's Frequency, or a set time; short enough, its songs blend. */
  drawSongGap(g, left, y, right) {
    const cfg = this.cfg, at = Math.max(0, SONG_GAPS.indexOf(cfg.songGap));
    y = this.sliderRow(g, left, y, right, tr('cuemymusic.option.gap'), gapLabel(cfg.songGap), at / (SONG_GAPS.length - 1), f => {
      const gap = SONG_GAPS[Math.round(f * (SONG_GAPS.length - 1))];
      if (gap === cfg.songGap) return;
      cfg.songGap = gap;
      this.player.replan();
      if (gap >= 0 && this.player.waitingForGame() && this.player.breakLeft > gap) this.player.breakLeft = gap;
    }, 0, -1);
    // The game's Frequency defaults to Default, not Constant.
    const blends = cfg.songGap >= 0 && cfg.songGap <= 5;
    const note = tr(blends ? 'cuemymusic.option.gap.blends' : cfg.songGap < 0 ? 'cuemymusic.option.gap.game' : 'cuemymusic.option.gap.desc');
    g.textWithWordWrap(note, left, y - 4, right - left, FAINT);
    return y + this.font.wrapHeight(note, right - left);
  },

  toggleRow(g, left, y, right, label, desc, on, flip) {
    g.text(label, left, y + 1, WHITE);
    g.text(this.clip(desc, right - left - 34), left, y + 11, DIM);
    const sw = 22, sh = 11, sx = right - sw;
    g.fill(sx, y + 4, sx + sw, y + 4 + sh, on ? GREEN : TRACK_BG);
    const knob = on ? sx + sw - sh + 1 : sx + 1;
    g.fill(knob, y + 5, knob + sh - 2, y + 4 + sh - 1, on ? BLACK : WHITE);
    this.hit(sx - 4, y, sx + sw + 4, y + 20, flip);
    return y + 24;
  },

  sliderRow(g, left, y, right, label, value, fraction, set, defaultFraction, applying) {
    const font = this.font;
    g.text(label, left, y + 1, WHITE);
    // While the change is on its way, the value is dimmed with a ring that fills until it's heard.
    g.text(value, right - font.width(value), y + 1, applying >= 0 ? DIM : GREEN);
    if (applying >= 0) applyingIcon(g, right - font.width(value) - 11, y + 1, applying);
    const bx0 = left, bx1 = right, by = y + 15;
    g.fill(bx0, by, bx1, by + 3, TRACK_BG);
    const dx = bx0 + Math.round(defaultFraction * (bx1 - bx0));
    g.fill(dx, by - 2, dx + 1, by + 5, FAINT);
    const kx = bx0 + Math.round(clamp(fraction, 0, 1) * (bx1 - bx0));
    g.fill(bx0, by, kx, by + 3, this.cfg.enabled ? GREEN : FAINT);
    g.fill(kx - 3, by - 3, kx + 3, by + 6, WHITE);
    this.drag(bx0 - 4, by - 6, bx1 + 4, by + 9, false, set, () => {});
    return y + 26;
  },

  // ------------------------------------------------------ now playing, queue

  drawNowPlaying(g, x0, y0, x1, y1, mx, my) {
    const player = this.player, font = this.font;
    g.fill(x0, y0, x1, y1, 0xFF121212);
    const t = player.current, pad = 8, w = x1 - x0 - pad * 2, left = x0 + pad;
    this.queueRows = 0;
    this.queueFit = 0;
    if (!t) {
      g.text(tr('cuemymusic.now_playing'), left, y0 + 7, WHITE);
      // Add-ons with no add-on songs stays quiet: say why.
      const none = tr(this.mode() === 'addons' && !this.lib.addOnMusic().length ? 'cuemymusic.now_playing.no_addons' : 'cuemymusic.now_playing.none');
      g.textWithWordWrap(none, left, y0 + 24, w, DIM);
      this.drawQueue(g, x0, y0 + 24 + font.wrapHeight(none, w) + 12, x1, y1, mx, my);
      return;
    }
    // Where it's playing from, art, title, artist. Long titles and artists scroll.
    const list = player.playingList();
    const from = list == null ? tr('cuemymusic.now_playing.from_game') : tr('cuemymusic.now_playing.from', this.listName(list));
    this.marquee(g, from, left, y0 + 7, w, WHITE, 1);
    // The art gives up room to the queue when there is one.
    const empty = !player.queue().length;
    const size = Math.min(w, Math.floor((y1 - y0) * (empty ? 2 : 1) / (empty ? 5 : 4)));
    this.art(g, t.art, left + Math.floor((w - size) / 2), y0 + 20, size);
    let y = y0 + 25 + size;
    this.marquee(g, t.title, left, y, w, WHITE, 1.5);
    y += 15;
    this.marquee(g, t.artist, left, y, w - 24, DIM, 1);
    const liked = this.isLiked(t), hx = left + w - 7;
    const heartHover = mx >= hx - 2 && mx < hx + 9 && my >= y - 2 && my < y + 8;
    heartIcon(g, hx, y + 1, liked, liked ? GREEN : heartHover ? WHITE : DIM);
    this.hit(hx - 2, y - 2, hx + 9, y + 8, () => this.toggleLiked(t));
    if (player.allows(t)) {
      const dx = hx - 14, disliked = this.isDisliked(t);
      const dislikeHover = mx >= dx - 2 && mx < dx + 11 && my >= y - 2 && my < y + 11;
      dislikeIcon(g, dx, y, disliked, disliked ? RED : dislikeHover ? WHITE : DIM);
      this.hit(dx - 2, y - 2, dx + 11, y + 11, () => this.toggleDisliked(t));
    }
    y += 16;
    this.drawQueue(g, x0, y, x1, y1, mx, my);
  },

  drawQueue(g, x0, y, x1, y1, mx, my) {
    const player = this.player, font = this.font;
    // Next from's rows count only where they're drawn this frame.
    this.nextFromRows = 0;
    const left = x0 + 8, right = x1 - 8, queue = player.queue();
    // The game's next song comes after the queue, with the break before it.
    const game = player.upcoming();
    let gameWhen = null;
    if (game) {
      const wait = time(player.untilUpcoming());
      gameWhen = !player.waitingForGame() && player.untilUpcoming() < 1 ? tr('cuemymusic.queue.right_after')
        : player.waitingForGame() && !queue.length ? tr('cuemymusic.queue.in', wait) : tr('cuemymusic.queue.after_break', wait);
    }

    const listNext = player.listNext();
    if (!queue.length && listNext) {
      if (y + 12 + ROW > y1) return;
      // Repeat one, or the list going round again, has one next song; otherwise all that's left.
      const rest = player.upNext(Math.max(1, Math.floor((y1 - y - 12 - 4) / QROW)));
      // Repeat one: the song playing comes round again, so it's "On repeat", not next up.
      const again = listNext === player.current;
      if (!rest.length || rest[0] !== listNext) {
        g.text(this.clip(tr(again ? 'cuemymusic.queue.on_repeat' : 'cuemymusic.queue.next_up'), right - left), left, y, WHITE);
        this.nextRow(g, listNext, listNext.artist, x0, y + 12, x1, mx, my, () => player.next());
        return;
      }
      this.drawNextFrom(g, rest, x0, y, x1, y1, mx, my);
      return;
    }

    if (!queue.length) {
      if (!game || y + 12 + ROW > y1) {
        if (y + 20 < y1) {
          g.text(this.clip(tr('cuemymusic.queue'), right - left), left, y, WHITE);
          g.textWithWordWrap(tr('cuemymusic.queue.empty'), left, y + 12, right - left, FAINT);
        }
        return;
      }
      g.text(this.clip(tr('cuemymusic.queue.next_up'), right - left), left, y, WHITE);
      this.gameRow(g, game, gameWhen, x0, y + 12, x1, mx, my);
      const hy = y + 12 + ROW + 8, hint = tr('cuemymusic.queue.empty');
      if (hy + font.wrapHeight(hint, right - left) < y1) g.textWithWordWrap(hint, left, hy, right - left, FAINT);
      return;
    }

    const gameH = game ? 12 + ROW + 6 : 0;
    g.text(this.clip(tr('cuemymusic.queue'), right - left - 30), left, y, WHITE);
    // Clear.
    const clear = tr('cuemymusic.queue.clear'), cx = right - font.width(clear);
    const clearHover = this.queueDrag < 0 && mx >= cx - 2 && mx < right + 2 && my >= y - 2 && my < y + 10;
    g.text(clear, cx, y, clearHover ? WHITE : DIM);
    this.hit(cx - 2, y - 2, right + 2, y + 10, () => {
      player.clearQueue();
      this.queueScroll = 0;
      this.showToast(tr('cuemymusic.queue.cleared'));
    });
    this.queueX0 = x0;
    this.queueX1 = x1;
    this.queueTop = y + 12;
    // The queue gets the room first; the game's song only shows if the whole queue fits above it. A longer queue scrolls.
    const fit = Math.max(0, Math.floor((y1 - this.queueTop - 4) / QROW));
    const showGame = game && queue.length <= Math.floor((y1 - gameH - this.queueTop - 4) / QROW);
    this.queueFit = fit;
    // Dragging a row past the top or bottom edge scrolls the queue.
    if (this.queueDrag >= 0 && this.queueDragY < this.queueTop + 4) this.queueScroll -= 0.15;
    if (this.queueDrag >= 0 && this.queueDragY > this.queueTop + fit * QROW - 4) this.queueScroll += 0.15;
    this.queueScroll = clamp(this.queueScroll, 0, Math.max(0, queue.length - fit));
    const first = Math.round(this.queueScroll);
    this.queueRows = Math.min(fit, queue.length - first);

    for (let k = 0; k < this.queueRows; k++) {
      const i = first + k;
      if (i === this.queueDrag) continue;
      const ry = this.queueTop + k * QROW, hover = this.queueDrag < 0 && mx >= x0 && mx < x1 && my >= ry && my < ry + QROW;
      if (hover) g.fill(x0 + 4, ry, x1 - 4, ry + QROW, ROW_HOVER);
      this.compactQueueRow(g, queue[i], left, ry, right - left - (hover ? 10 : 0));
      if (hover) crossIcon(g, right - 7, ry + 3, mx >= right - 9 ? WHITE : DIM);
    }
    const end = this.queueTop + this.queueRows * QROW;
    if (queue.length > fit && fit > 0) {
      // Scrollbar along the right edge.
      const barH = fit * QROW, thumbH = Math.max(6, Math.floor(barH * fit / queue.length));
      const thumbY = this.queueTop + Math.round((barH - thumbH) * this.queueScroll / (queue.length - fit));
      g.fill(x1 - 3, this.queueTop, x1 - 2, this.queueTop + barH, 0xFF2A2A2A);
      g.fill(x1 - 3, thumbY, x1 - 2, thumbY + thumbH, FAINT);
    }
    const rest = queue.length <= fit ? player.upNext(Math.max(0, Math.floor((y1 - end - 6 - 12 - 4) / QROW))) : [];
    if (rest.length) {
      // Then the rest of the list, as Next from.
      this.drawNextFrom(g, rest, x0, end + 6, x1, y1, mx, my);
    } else if (showGame && player.playingList() == null) {
      g.text(this.clip(tr('cuemymusic.queue.from_game'), right - left), left, end + 6, WHITE);
      this.gameRow(g, game, gameWhen, x0, end + 18, x1, mx, my);
    }

    // The row being dragged follows the mouse, with a line where it will land.
    if (this.queueDrag >= 0 && this.queueDrag < queue.length) {
      const ly = this.queueTop + (this.dropSlot(this.queueDragY) - first) * QROW;
      g.fill(x0 + 4, ly - 1, x1 - 4, ly + 1, GREEN);
      const ry = Math.round(this.queueDragY) - Math.floor(QROW / 2);
      g.fill(x0 + 4, ry, x1 - 4, ry + QROW, 0xFF333333);
      this.compactQueueRow(g, queue[this.queueDrag], left, ry, right - left);
    }
  },

  /** Repeat off, all, one; while Radio plays, says why it can't. */
  cycleRepeat() {
    if (this.player.isPlayingList(RADIO)) {
      this.showToast(tr('cuemymusic.repeat.radio'));
      return;
    }
    const next = { off: 'all', all: 'one', one: 'off' }[this.cfg.repeat];
    this.cfg.repeat = next;
    this.showToast(tr('cuemymusic.repeat.' + next));
  },

  /** "Next from" the list playing, and its songs to come; clicking one skips the list to it. */
  drawNextFrom(g, rest, x0, y, x1, y1, mx, my) {
    const left = x0 + 8, right = x1 - 8;
    g.text(this.clip(tr('cuemymusic.queue.next_from', this.listName(this.player.playingList())), right - left), left, y, WHITE);
    // Clicking a row plays it; dragging one moves it, as in the queue.
    this.nextFromX0 = x0;
    this.nextFromX1 = x1;
    this.nextFromTop = y + 12;
    this.nextFromRows = 0;
    const dragging = this.nextFromDrag >= 0 && this.nextFromDrag < rest.length && Math.abs(this.nextFromDragY - this.nextFromPressY) > 4;
    for (let k = 0; k < rest.length; k++) {
      const ry = this.nextFromTop + k * QROW;
      if (ry + QROW > y1) break;
      this.nextFromRows++;
      if (dragging && k === this.nextFromDrag) continue;
      const hover = this.queueDrag < 0 && this.nextFromDrag < 0 && mx >= x0 && mx < x1 && my >= ry && my < ry + QROW;
      if (hover) g.fill(x0 + 4, ry, x1 - 4, ry + QROW, ROW_HOVER);
      this.compactQueueRow(g, rest[k], left, ry, right - left);
    }
    if (dragging) {
      const ly = this.nextFromTop + this.nextFromSlot(this.nextFromDragY) * QROW;
      g.fill(x0 + 4, ly - 1, x1 - 4, ly + 1, GREEN);
      const ry = Math.round(this.nextFromDragY) - Math.floor(QROW / 2);
      g.fill(x0 + 4, ry, x1 - 4, ry + QROW, 0xFF333333);
      this.compactQueueRow(g, rest[this.nextFromDrag], left, ry, right - left);
    }
  },

  /** Where a dragged Next from row would land, as a place between its rows. */
  nextFromSlot(y) {
    return clamp(Math.round((y - this.nextFromTop) / QROW), 0, this.nextFromRows);
  },

  /** Pressing a Next from row: it plays on release, or moves if it's dragged first. */
  nextFromClicked(x, y) {
    if (!this.nextFromRows || x < this.nextFromX0 || x >= this.nextFromX1 || y < this.nextFromTop || y >= this.nextFromTop + this.nextFromRows * QROW) return false;
    this.nextFromDrag = Math.floor((y - this.nextFromTop) / QROW);
    this.nextFromDragY = this.nextFromPressY = y;
    return true;
  },

  /** What a list the player plays through is called, from its key. */
  listName(listKey) {
    const k = String(listKey), colon = k.indexOf(':'), kind = colon < 0 ? k : k.slice(0, colon), rest = colon < 0 ? '' : k.slice(colon + 1);
    switch (kind) {
      case ALL: return tr('cuemymusic.playlist.title');
      case RADIO: return tr('cuemymusic.radio.title');
      case 'liked': return tr('cuemymusic.liked.title');
      case 'disliked': return tr('cuemymusic.disliked.title');
      case 'artist': return rest;
      case 'pack': return this.lib.pack(rest)?.name ?? tr('cuemymusic.queue.a_pack');
      case 'stats': return tr('cuemymusic.home.top_songs');
      case 'list': return this.playlist(rest)?.name ?? tr('cuemymusic.playlist');
      case 'pool': return this.poolName(rest);
      case 'search': return tr('cuemymusic.queue.search', rest);
      default: return tr('cuemymusic.queue.the_list');
    }
  },

  /** The game's next song. Clicking it plays it now. */
  gameRow(g, t, when, x0, y, x1, mx, my) {
    this.nextRow(g, t, when, x0, y, x1, mx, my, () => this.player.playUpcoming());
  },

  /** The song that plays next, with a line below it; clicking plays it now. */
  nextRow(g, t, below, x0, y, x1, mx, my, play) {
    const hover = this.queueDrag < 0 && mx >= x0 && mx < x1 && my >= y && my < y + ROW;
    if (hover) g.fill(x0 + 4, y, x1 - 4, y + ROW, ROW_HOVER);
    // The wait can be wider than the panel, so it scrolls like the song names.
    this.queueRow(g, t, x0 + 8, y, x1 - x0 - 16, DIM, '');
    this.marquee(g, below, x0 + 28, y + 11, x1 - x0 - 36, DIM, 1);
    this.hit(x0, y, x1, y + ROW, play);
  },

  queueRow(g, t, x, y, w, titleColor, below) {
    this.art(g, t.art, x, y + 2, 16);
    g.text(this.clip(t.title, w - 20), x + 20, y + 2, titleColor);
    g.text(this.clip(below, w - 20), x + 20, y + 11, DIM);
  },

  /** A queued song on one line: small art, the title, then the artist dimmed. */
  compactQueueRow(g, t, x, y, w) {
    this.art(g, t.art, x, y + 2, 9);
    const tx = x + 13, avail = w - 13, title = this.clip(t.title, avail);
    g.text(title, tx, y + 3, WHITE);
    const aw = avail - this.font.width(title) - 5;
    if (aw > 12) g.text(this.clip(t.artist, aw), tx + this.font.width(title) + 5, y + 3, DIM);
  },

  /** Where a dragged queue row would land, as an index between rows. */
  dropSlot(y) {
    return Math.round(this.queueScroll) + clamp(Math.round((y - this.queueTop) / QROW), 0, this.queueRows);
  },

  // ------------------------------------------------------------- bottom bar

  drawBottomBar(g, x0, y0, x1, y1, mx, my) {
    const player = this.player, cfg = this.cfg, font = this.font, t = player.current;
    // Current song on the left.
    const barW = Math.min(360, Math.floor((x1 - x0) * 2 / 5));
    // Stops short of the elapsed time left of the progress bar.
    const leftW = Math.min(170, Math.floor((x0 + x1) / 2) - Math.floor(barW / 2) - 12 - font.width('00:00') - x0 - GAP);
    if (t) {
      this.art(g, t.art, x0 + GAP + 2, y0 + 7, 28);
      const tx = x0 + GAP + 36, room = leftW - 36 - 16, title = this.clip(t.title, room), artist = this.clip(t.artist, room);
      g.text(title, tx, y0 + 12, WHITE);
      g.text(artist, tx, y0 + 22, DIM);
      // Like, right of the song.
      const hx = tx + Math.max(font.width(title), font.width(artist)) + 8, hy = y0 + 17, liked = this.isLiked(t);
      heartIcon(g, hx, hy, liked, liked ? GREEN : this.hoverColor(hx - 2, hy - 2, 13, 12));
      this.hit(hx - 2, hy - 2, hx + 11, hy + 10, () => this.toggleLiked(t));
    }

    // Controls in the middle.
    const cx = Math.floor((x0 + x1) / 2), cy = y0 + 5, btn = 14, half = btn / 2;
    const shx = cx - half - 42;
    shuffleIcon(g, shx, cy + 2, cfg.shuffle ? GREEN : this.hoverColor(shx - 2, cy, 13, 12));
    if (cfg.shuffle) g.fill(shx + 4, cy + 12, shx + 6, cy + 13, GREEN);
    this.hit(shx - 2, cy, shx + 11, cy + 12, () => this.toggleShuffle());
    this.hit(cx - half - 22, cy, cx - half - 10, cy + 12, () => player.previous());
    previousIcon(g, cx - half - 20, cy + 2, 8, this.hoverColor(cx - half - 22, cy, 12, 12));
    roundButton(g, cx - half, cy - 1, btn, WHITE);
    if (player.isPlaying()) pauseIcon(g, cx - 3, cy + 2, 7, BLACK);
    else playIcon(g, cx - 2, cy + 2, 7, BLACK);
    this.hit(cx - half, cy - 1, cx + half, cy - 1 + btn, () => player.togglePause());
    this.hit(cx + half + 10, cy, cx + half + 22, cy + 12, () => player.next());
    nextIcon(g, cx + half + 12, cy + 2, 8, this.hoverColor(cx + half + 10, cy, 12, 12));
    // Repeat: off, all, one. Radio never ends, so repeat is greyed out while it plays.
    const repeat = player.repeat(), radio = player.isPlayingList(RADIO), rx = cx + half + 32;
    repeatIcon(g, rx, cy + 2, repeat, radio ? 0xFF3A3A3A : repeat !== 'off' ? GREEN : this.hoverColor(rx - 2, cy, 13, 12));
    this.hit(rx - 2, cy, rx + 11, cy + 12, () => this.cycleRepeat());

    // Progress bar under the controls.
    const bx0 = cx - Math.floor(barW / 2), bx1 = cx + Math.floor(barW / 2), by = y0 + 27;
    const len = t?.seconds || 0, pos = this.seekPreview >= 0 ? this.seekPreview : player.position;
    const posText = t ? time(pos) : '-:--', lenText = len === 0 ? '-:--' : time(len);
    g.text(posText, bx0 - 6 - font.width(posText), by - 3, DIM);
    g.text(lenText, bx1 + 6, by - 3, DIM);
    g.fill(bx0, by, bx1, by + 3, TRACK_BG);
    const barHover = mx >= bx0 && mx < bx1 && my >= by - 5 && my < by + 8;
    if (len > 0) {
      const px = bx0 + Math.round(clamp(pos / len, 0, 1) * (bx1 - bx0));
      g.fill(bx0, by, px, by + 3, barHover || (this.dragging && this.seekPreview >= 0) ? GREEN : WHITE);
      if (barHover || this.seekPreview >= 0) g.fill(px - 3, by - 2, px + 3, by + 5, WHITE);
      this.drag(bx0, by - 5, bx1, by + 8, false, f => (this.seekPreview = f * len), () => {
        player.seek(this.seekPreview);
        this.seekPreview = -1;
      });
    }

    // Right of the progress bar, from the right: pitch and speed (opens settings), the ring that shows a change on its
    // way, the music volume. Pitch and speed are left out first when the bar is narrow.
    let fx = cfg.enabled ? tr('cuemymusic.bar.fx', signed(cfg.pitchSemitones), cfg.speed.toFixed(2)) : tr('cuemymusic.bar.fx_off');
    const roomLeft = bx1 + font.width(lenText) + 16, right = x1 - GAP - 4;
    // Where the full readout doesn't fit, a short one: still says what it is, and still opens Settings.
    if (right - font.width(fx) - 24 - 56 - 15 <= roomLeft) {
      fx = cfg.enabled ? tr('cuemymusic.bar.fx_short', signed(cfg.pitchSemitones), cfg.speed.toFixed(2)) : tr('cuemymusic.bar.fx_off_short');
    }
    const fw = font.width(fx), showFx = right - fw - 24 - 24 - 15 > roomLeft, fx0 = showFx ? right - fw : right + 10;
    if (showFx) {
      g.text(fx, fx0, y0 + 17, cfg.enabled && (cfg.pitchSemitones !== 0 || cfg.speed !== 1) ? GREEN : DIM);
      this.hit(fx0, y0 + 12, x1, y0 + 30, () => this.open('SETTINGS', null));
    }
    const applying = this.applying();
    if (applying >= 0) applyingIcon(g, fx0 - 11, y0 + 17, applying);
    // The slider narrows before it would go.
    const vx1 = fx0 - 24, vx0 = Math.min(vx1 - 24, Math.max(vx1 - 56, roomLeft + 15)), ix = vx0 - 15;
    if (ix > roomLeft - 2) this.drawVolume(g, ix, vx0, vx1, y0 + 20, mx, my);
  },

  /** The music volume, as a speaker and a slider. Clicking the speaker mutes and unmutes. */
  drawVolume(g, ix, vx0, vx1, vy, mx, my) {
    const cfg = this.cfg, v = cfg.volume;
    const iconHover = mx >= ix - 2 && mx < ix + 12 && my >= vy - 7 && my < vy + 7;
    speakerIcon(g, ix, vy - 5, v, iconHover ? WHITE : DIM);
    this.hit(ix - 2, vy - 7, ix + 12, vy + 7, () => {
      if (cfg.volume > 0) {
        this.unmutedVolume = cfg.volume;
        cfg.volume = 0;
      } else {
        cfg.volume = this.unmutedVolume > 0 ? this.unmutedVolume : 1;
      }
    });
    const hover = mx >= vx0 - 2 && mx < vx1 + 2 && my >= vy - 6 && my < vy + 8;
    const held = this.dragging && this.dragging.y0 === vy - 6 && this.dragging.x0 === vx0 - 2;
    g.fill(vx0, vy, vx1, vy + 3, TRACK_BG);
    const px = vx0 + Math.round(clamp(v, 0, 1) * (vx1 - vx0));
    g.fill(vx0, vy, px, vy + 3, hover || held ? GREEN : WHITE);
    if (hover || held) g.fill(px - 3, vy - 2, px + 3, vy + 5, WHITE);
    this.drag(vx0 - 2, vy - 6, vx1 + 2, vy + 8, false, f => (cfg.volume = Math.round(f * 100) / 100), () => {});
  },
});
