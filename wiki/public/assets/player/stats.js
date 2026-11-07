// Your Stats, from CueScreen's stats section. The listening it shows is made up (see model.js Stats), then
// grows with what's played here.

import { CueScreen, Canvas, WHITE, DIM, FAINT, GREEN, BLACK, ROW_HOVER, STATS_ART, longDuration } from './screen.js';
import { tr, clamp } from './model.js';

/** A Minecraft day, sunrise to sunrise. */
const MINECRAFT_DAY = 20 * 60;
/** C418's Sweden is 3:35. */
const SWEDEN = 215;
/** Calendar cells from no listening to the most in a day. */
const HEAT = [0xFF242424, 0xFF0E4429, 0xFF006D32, 0xFF26A641, 0xFF39D353];
const GAME_BLUE = 0xFF5A8DEE, GOLD = 0xFFFFC94A, ARTIST_PURPLE = 0xFF9B7BFF, RESET_MILLIS = 3000;
const plusDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

Object.assign(CueScreen.prototype, {
  drawStats(g, x0, y, x1, mx, my) {
    const s = this.stats, font = this.font;
    const summary = s.isEmpty() ? tr('cuemymusic.stats.summary.empty')
      : tr('cuemymusic.stats.summary', longDuration(s.totalSeconds()),
        new Date(s.since()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }));
    y = this.drawHeader(g, x0, y, x1, STATS_ART, tr('cuemymusic.stats.kind'), tr('cuemymusic.stats.title'), summary, 0xFF1E3A5A) + 8;
    const left = x0 + 12, right = x1 - 12, w = right - left;
    if (s.isEmpty()) {
      const empty = tr('cuemymusic.stats.empty');
      g.textWithWordWrap(empty, left, y, w, DIM);
      return y + font.wrapHeight(empty, w) + 8;
    }
    const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    y = this.statTiles(g, left, y, right, s, [...s.songs.values()].filter(x => x.seconds > 0).length, today) + 8;
    const fun = tr('cuemymusic.stats.fun', (s.totalSeconds() / MINECRAFT_DAY).toFixed(1), (s.totalSeconds() / SWEDEN).toFixed(1));
    g.textWithWordWrap(fun, left, y, w, FAINT);
    y += font.wrapHeight(fun, w) + 14;

    // Two columns when there's room, one under the other when there isn't.
    const wide = w >= 300, clockW = 128;
    if (wide) {
      const a = this.topSongs(g, left, y, right - clockW - 16, mx, my, s), b = this.listeningClock(g, right - clockW, y, right, s);
      y = Math.max(a, b) + 14;
    } else {
      y = this.topSongs(g, left, y, right, mx, my, s) + 14;
      y = this.listeningClock(g, left + Math.floor((w - clockW) / 2), y, left + Math.floor((w + clockW) / 2), s) + 14;
    }
    y = this.calendar(g, left, y, right, mx, my, s, today) + 14;
    if (wide) {
      const half = Math.floor((w - 16) / 2);
      const a = this.topArtists(g, left, y, left + half, s), b = this.whereAndWho(g, left + half + 16, y, right, s);
      y = Math.max(a, b) + 14;
    } else {
      y = this.topArtists(g, left, y, right, s) + 14;
      y = this.whereAndWho(g, left, y, right, s) + 14;
    }

    const c = new Canvas(this, g, x0, y, x1, mx, my);
    const skippedId = s.mostSkipped(), skipped = skippedId && this.lib.get(skippedId);
    if (skipped) {
      c.heading(tr('cuemymusic.stats.skipped'));
      this.art(g, skipped.art, left, c.y, 16);
      const count = tr('cuemymusic.stats.skips', s.songs.get(skipped.id).skips), tw = right - left - 22 - font.width(count) - 8;
      g.text(this.clip(skipped.title, tw), left + 22, c.y, WHITE);
      g.text(this.clip(skipped.artist, tw), left + 22, c.y + 9, DIM);
      g.text(count, right - font.width(count), c.y + 4, DIM);
      c.y += 22;
      if (this.player.allows(skipped) && !this.isDisliked(skipped)) {
        c.text(tr('cuemymusic.stats.skipped.hint'), FAINT);
        c.space(2);
        c.button(left, tr('cuemymusic.menu.dislike'), 'SECONDARY', true, () => this.toggleDisliked(skipped));
        c.space(c.buttonHeight());
      }
      c.space(14);
    }
    const armed = Date.now() - this.resetArmedAt < RESET_MILLIS;
    c.button(left, tr(armed ? 'cuemymusic.stats.reset.confirm' : 'cuemymusic.stats.reset'), armed ? 'DANGER' : 'SECONDARY', true, () => {
      if (Date.now() - this.resetArmedAt < RESET_MILLIS) {
        this.resetArmedAt = 0;
        s.reset();
        this.showToast(tr('cuemymusic.stats.reset.done'));
      } else {
        this.resetArmedAt = Date.now();
      }
    });
    return c.y + c.buttonHeight();
  },

  /** Four tiles: time, plays, songs, and the streak. Two rows of two when narrow. */
  statTiles(g, x0, y, x1, s, songCount, today) {
    const values = [longDuration(s.totalSeconds()), String(s.totalPlays()), String(songCount), String(s.currentStreak(today))];
    const labels = [tr('cuemymusic.stats.tile.time'), tr('cuemymusic.stats.tile.plays'), tr('cuemymusic.stats.tile.songs'),
      tr('cuemymusic.stats.tile.streak', s.longestStreak())];
    const colors = [GREEN, WHITE, WHITE, 0xFFFFB347];
    const cols = x1 - x0 >= 300 ? 4 : 2, gap = 6, th = 36, tw = Math.floor((x1 - x0 - gap * (cols - 1)) / cols);
    for (let i = 0; i < 4; i++) {
      const tx = x0 + (i % cols) * (tw + gap), ty = y + Math.floor(i / cols) * (th + gap);
      g.fill(tx, ty, tx + tw, ty + th, 0xFF1C1C1C);
      g.fill(tx, ty, tx + 2, ty + th, colors[i]);
      const scale = this.font.width(values[i]) * 1.5 <= tw - 14 ? 1.5 : 1;
      this.bigText(g, this.clip(values[i], Math.floor((tw - 14) / scale)), tx + 8, ty + 7, scale, colors[i]);
      g.text(this.clip(labels[i], tw - 14), tx + 8, ty + 23, DIM);
    }
    return y + (4 / cols) * (th + gap) - gap;
  },

  /** The five most played songs, each with a bar for its plays. Click one to play the five from there. */
  topSongs(g, x0, y, x1, mx, my, s) {
    const font = this.font;
    g.text(tr('cuemymusic.stats.top_songs'), x0, y, WHITE);
    y += 14;
    const top = s.top(20).map(id => this.lib.get(id)).filter(Boolean).slice(0, 5);
    if (!top.length) {
      g.text(tr('cuemymusic.stats.none'), x0, y, FAINT);
      return y + 12;
    }
    const max = s.songs.get(top[0].id).plays;
    top.forEach((t, i) => {
      const plays = s.songs.get(t.id).plays, ry = y + i * 22;
      const hover = mx >= x0 && mx < x1 && my >= ry && my < ry + 20 && my >= this.centerY0 && my < this.centerY1;
      if (hover) g.fill(x0 - 2, ry, x1 + 2, ry + 20, ROW_HOVER);
      const rank = String(i + 1);
      g.text(rank, x0 + 4 - Math.floor(font.width(rank) / 2), ry + 6, i === 0 ? GOLD : DIM);
      this.art(g, t.art, x0 + 12, ry + 2, 16);
      const tx = x0 + 32, label = hover ? t.artist : tr('cuemymusic.stats.plays', plays), lw = font.width(label);
      g.text(this.clip(t.title, x1 - tx - lw - 6), tx, ry + 2, i === 0 ? GREEN : WHITE);
      g.text(this.clip(label, x1 - tx), x1 - Math.min(lw, x1 - tx), ry + 2, DIM);
      const bw = Math.round((x1 - tx) * plays / Math.max(1, max));
      g.fill(tx, ry + 13, x1, ry + 16, 0xFF262626);
      g.fill(tx, ry + 13, tx + bw, ry + 16, i === 0 ? GREEN : 0xFF1F7A43);
      const top0 = Math.max(ry, this.centerY0), bottom = Math.min(ry + 20, this.centerY1);
      if (bottom > top0) this.hit(x0, top0, x1, bottom, () => this.player.play('stats', top, i));
    });
    return y + top.length * 22;
  },

  /** A 24-hour clock with a petal for each hour, as long as the listening in that hour. Midnight is at the top. */
  listeningClock(g, x0, y, x1, s) {
    const font = this.font;
    g.text(tr('cuemymusic.stats.clock'), x0, y, WHITE);
    y += 16;
    const hours = s.hours, max = Math.max(0, ...hours), peak = s.peakHour();
    const r = Math.min(50, Math.floor((x1 - x0) / 2) - 12), inner = Math.max(8, Math.floor(r / 4));
    const cx = Math.floor((x0 + x1) / 2), cy = y + r + 10;
    for (let h = 0; h < 24; h++) {
      const len = max > 0 ? Math.round((r - inner) * hours[h] / max) : 0, color = h === peak ? GREEN : 0xFF2E7D4F;
      if (len === 0) {
        const a = (h + 0.5) / 24 * 2 * Math.PI - Math.PI / 2;
        const px = cx + Math.round(Math.cos(a) * inner), py = cy + Math.round(Math.sin(a) * inner);
        g.fill(px, py, px + 1, py + 1, 0xFF3A3A3A);
        continue;
      }
      // Three rays across the hour make a petal.
      for (let k = -1; k <= 1; k++) {
        const a = (h + 0.5 + k * 0.28) / 24 * 2 * Math.PI - Math.PI / 2, cos = Math.cos(a), sin = Math.sin(a);
        const reach = inner + (k === 0 ? len : Math.floor(len * 4 / 5));
        for (let d = inner; d <= reach; d++) {
          const px = cx + Math.round(cos * d), py = cy + Math.round(sin * d);
          g.fill(px, py, px + 2, py + 2, color);
        }
      }
    }
    // The rim: a dot every hour, bigger every six.
    for (let h = 0; h < 24; h++) {
      const a = h / 24 * 2 * Math.PI - Math.PI / 2;
      const px = cx + Math.round(Math.cos(a) * (r + 4)), py = cy + Math.round(Math.sin(a) * (r + 4)), size = h % 6 === 0 ? 2 : 1;
      g.fill(px, py, px + size, py + size, FAINT);
    }
    g.text('0', cx - Math.floor(font.width('0') / 2) + 1, cy - r - 13, FAINT);
    g.text('12', cx - Math.floor(font.width('12') / 2) + 1, cy + r + 7, FAINT);
    g.text('6', cx + r + 8, cy - 3, FAINT);
    g.text('18', cx - r - 8 - font.width('18'), cy - 3, FAINT);
    const now = new Date(), a = (now.getHours() + now.getMinutes() / 60) / 24 * 2 * Math.PI - Math.PI / 2;
    const nx = cx + Math.round(Math.cos(a) * (r + 4)), ny = cy + Math.round(Math.sin(a) * (r + 4));
    g.fill(nx - 1, ny - 1, nx + 2, ny + 2, WHITE);

    y = cy + r + 20;
    if (peak >= 0) {
      const type = tr('cuemymusic.stats.type.' + (peak < 5 || peak >= 22 ? 'night' : peak < 11 ? 'morning' : peak < 17 ? 'day' : 'evening'));
      const when = tr('cuemymusic.stats.peak', new Date(2000, 0, 1, peak).toLocaleTimeString(undefined, { hour: 'numeric' }));
      g.text(type, cx - Math.floor(font.width(type) / 2), y, GREEN);
      g.text(this.clip(when, x1 - x0), cx - Math.floor(Math.min(font.width(when), x1 - x0) / 2), y + 11, DIM);
      y += 22;
    }
    return y;
  },

  /** A cell per day for the last weeks, Monday at the top, greener the more was heard. Hover a day for its time. */
  calendar(g, x0, y, x1, mx, my, s, today) {
    const font = this.font;
    g.text(tr('cuemymusic.stats.calendar'), x0, y, WHITE);
    y += 14;
    const cell = 7, step = 9, labelW = 12, weeks = clamp(Math.floor((x1 - x0 - labelW) / step), 4, 30);
    const first = plusDays(today, -((today.getDay() + 6) % 7) - 7 * (weeks - 1));
    let max = 0;
    for (let d = first; d <= today; d = plusDays(d, 1)) max = Math.max(max, s.day(d));
    const gx = x0 + labelW, gy = y + 11;
    let hovered = null, monthEnd = -Infinity;
    for (let w = 0; w < weeks; w++) {
      const monday = plusDays(first, 7 * w), cx = gx + w * step;
      if ((w === 0 || monday.getMonth() !== plusDays(monday, -7).getMonth()) && cx >= monthEnd) {
        const month = monday.toLocaleDateString(undefined, { month: 'short' });
        g.text(month, cx, y, FAINT);
        monthEnd = cx + font.width(month) + 4;
      }
      for (let d = 0; d < 7; d++) {
        const date = plusDays(monday, d);
        if (date > today) continue;
        const sec = s.day(date), level = sec <= 0 || max <= 0 ? 0 : 1 + Math.min(3, Math.floor(sec / max * 4 - 1e-9));
        const cy = gy + d * step;
        const hover = mx >= cx && mx < cx + step && my >= cy && my < cy + step && my >= this.centerY0 && my < this.centerY1;
        if (hover) hovered = date;
        if (date.getTime() === today.getTime() || hover) g.fill(cx - 1, cy - 1, cx + cell + 1, cy + cell + 1, hover ? WHITE : DIM);
        g.fill(cx, cy, cx + cell, cy + cell, HEAT[level]);
      }
    }
    for (let d = 0; d < 7; d += 2) {
      g.text(new Date(2024, 0, 1 + d).toLocaleDateString(undefined, { weekday: 'narrow' }), x0, gy + d * step, FAINT);
    }
    const bottom = gy + 7 * step + 2, gridRight = gx + weeks * step - 2;
    if (hovered) {
      const sec = s.day(hovered);
      const label = hovered.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + '  '
        + (sec > 0 ? longDuration(Math.max(60, sec)) : tr('cuemymusic.stats.nothing'));
      g.text(this.clip(label, x1 - gx), gx, bottom, WHITE);
    } else {
      // Less ■■■■■ More
      const less = tr('cuemymusic.stats.less'), more = tr('cuemymusic.stats.more');
      let lx = gridRight - font.width(more);
      g.text(more, lx, bottom, FAINT);
      for (let i = HEAT.length - 1; i >= 0; i--) {
        lx -= step;
        g.fill(lx, bottom, lx + cell, bottom + cell, HEAT[i]);
      }
      g.text(less, lx - 3 - font.width(less), bottom, FAINT);
    }
    return bottom + 10;
  },

  /** The five artists heard longest. */
  topArtists(g, x0, y, x1, s) {
    g.text(tr('cuemymusic.stats.top_artists'), x0, y, WHITE);
    y += 14;
    const byArtist = new Map();
    for (const [id, song] of s.songs) {
      const t = this.lib.get(id);
      if (t && song.seconds > 0) byArtist.set(t.artist, (byArtist.get(t.artist) || 0) + song.seconds);
    }
    const top = [...byArtist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!top.length) {
      g.text(tr('cuemymusic.stats.none'), x0, y, FAINT);
      return y + 12;
    }
    const max = top[0][1];
    top.forEach(([artist, sec], i) => {
      const ry = y + i * 20, tx = x0 + 20, time = longDuration(sec), lw = this.font.width(time);
      this.art(g, this.artistArt(artist), x0, ry + 1, 16);
      g.text(this.clip(artist, x1 - tx - lw - 6), tx, ry + 1, WHITE);
      g.text(time, x1 - lw, ry + 1, DIM);
      const bw = Math.round((x1 - tx) * sec / max);
      g.fill(tx, ry + 12, x1, ry + 15, 0xFF262626);
      g.fill(tx, ry + 12, tx + bw, ry + 15, i === 0 ? ARTIST_PURPLE : 0xFF5C4A99);
    });
    return y + top.length * 20;
  },

  /** Time per dimension as a bar of that dimension's blocks, then who picked the music: you or the game. */
  whereAndWho(g, x0, y, x1, s) {
    const font = this.font;
    g.text(tr('cuemymusic.stats.where'), x0, y, WHITE);
    y += 14;
    const blocks = { 'minecraft:overworld': 'block/moss_block', 'minecraft:the_nether': 'block/netherrack', 'minecraft:the_end': 'block/end_stone' };
    const places = [];
    let inWorlds = 0;
    for (const [id, seconds] of s.dims) {
      const path = id.slice(id.indexOf(':') + 1);
      places.push({ name: tr('cuemymusic.stats.dimension.' + path), art: { tex: blocks[id] || 'block/stone' }, seconds });
      inWorlds += seconds;
    }
    const menus = s.totalSeconds() - inWorlds;
    if (menus > s.totalSeconds() * 0.01) places.push({ name: tr('cuemymusic.stats.menus'), art: { tex: 'block/oak_planks' }, seconds: menus });
    places.sort((a, b) => b.seconds - a.seconds);
    const total = places.reduce((n, p) => n + p.seconds, 0), barH = 12;
    g.fill(x0, y, x1, y + barH, 0xFF262626);
    let sum = 0, px = x0;
    for (const p of places) {
      sum += p.seconds;
      const ex = x0 + Math.round((x1 - x0) * sum / total);
      if (ex <= px) continue;
      g.enableScissor(px, y, ex, y + barH);
      for (let tx = px; tx < ex; tx += barH) this.art(g, p.art, tx, y, barH);
      g.disableScissor();
      if (ex < x1) g.fill(ex, y, ex + 1, y + barH, BLACK);
      px = ex;
    }
    y += barH + 4;
    let lx = x0;
    for (const p of places) {
      const label = p.name + ' ' + Math.round(100 * p.seconds / total) + '%', iw = 11 + font.width(label) + 8;
      if (lx > x0 && lx + iw > x1) {
        lx = x0;
        y += 11;
      }
      this.art(g, p.art, lx, y, 8);
      g.text(label, lx + 11, y, DIM);
      lx += iw;
    }
    y += 18;

    g.text(tr('cuemymusic.stats.who'), x0, y, WHITE);
    y += 14;
    const you = s.picked, game = s.game, youShare = you + game > 0 ? you / (you + game) : 0;
    const split = x0 + Math.round((x1 - x0) * youShare);
    g.fill(x0, y, x1, y + 8, GAME_BLUE);
    g.fill(x0, y, split, y + 8, GREEN);
    y += 11;
    const youLabel = tr('cuemymusic.stats.who.you', Math.round(100 * youShare)), gameLabel = tr('cuemymusic.stats.who.game', 100 - Math.round(100 * youShare));
    g.text(youLabel, x0, y, GREEN);
    g.text(gameLabel, x1 - font.width(gameLabel), y, GAME_BLUE);
    y += 12;
    if (s.effects > 0) {
      const effects = tr('cuemymusic.stats.effects', longDuration(s.effects));
      g.textWithWordWrap(effects, x0, y, x1 - x0, FAINT);
      y += font.wrapHeight(effects, x1 - x0);
    }
    return y;
  },
});
