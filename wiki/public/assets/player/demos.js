// Scripted runs of the web player: a cursor that moves, clicks, drags and types as a person would, a caption for each step,
// and the keys it presses shown as it presses them. A demo plays while on screen, then starts over on a fresh player.
//
//   <div class="cmm-player" data-demo="select" data-parts="center"></div>
//
// A script is a generator: each helper yields until its step is done, and finds what to point at in the frame just drawn.

import { pixels } from './gfx.js';
import { QROW, WHITE, BLACK } from './screen.js';

const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
export const CMD = MAC ? 'Cmd' : 'Ctrl';

const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// ---------------------------------------------------------------- targets

/** A label drawn on screen, the last one drawn (the one on top) unless {@code nth} counts from the first. */
export const label = (text, nth = -1) => s => {
  let found = s.texts.filter(t => t.s === text);
  if (!found.length) found = s.texts.filter(t => t.s.startsWith(text));
  if (!found.length) found = s.texts.filter(t => t.s.includes(text));
  const t = found.at(nth);
  return t && { x: (t.x0 + t.x1) / 2, y: (t.y0 + t.y1) / 2 };
};

/** A song row, by its place in the list, a little in from its left. */
export const row = (i, dx = 60) => s => {
  const r = s.rowHits.find(r => r.index === i);
  return r && { x: r.x0 + Math.min(dx, (r.x1 - r.x0) / 2), y: (r.y0 + r.y1) / 2 };
};

/** A row's add to queue button, just left of the song's length. */
export const plus = i => s => {
  const r = s.rowHits.find(r => r.index === i);
  if (!r) return null;
  const len = s.texts.filter(t => /^(\d+:\d\d|-:--)$/.test(t.s) && t.y0 >= r.y0 && t.y1 <= r.y1 + 1).at(-1);
  return len && { x: len.x1 - 40 + 4, y: r.y0 + 8 };
};

/** A row of the queue, under now playing. */
export const queueRow = (i, dx = 40) => s => s.queueRows > i && { x: s.queueX0 + dx, y: s.queueTop + i * QROW + QROW / 2 };

/** Anywhere, worked out from the screen. */
export const at = f => s => f(s);

// ------------------------------------------------------------------ demos

export class Demo {
  constructor(script) {
    this.script = script;
  }

  start(screen) {
    this.screen = screen;
    screen.recordTexts = true;
    this.x = screen.width * 0.62;
    this.y = screen.height * 0.7;
    this.mods = { shift: false, ctrl: false, alt: false };
    this.held = false;
    this.caption = '';
    this.keycap = null;
    this.keycapLeft = 0;
    this.ring = -1;
    this.done = false;
    this.run = this.script(this);
    this.run.next();
  }

  /** Moves the script on by {@code ms}. */
  tick(ms) {
    if (this.done) return;
    this.keycapLeft -= ms;
    if (this.ring >= 0) this.ring = this.ring + ms > 360 ? -1 : this.ring + ms;
    try {
      if (this.run.next(ms).done) this.done = true;
    } catch (e) {
      // Something to point at never showed up: start over rather than stand still.
      console.warn('[cue-player] demo step failed', e);
      this.done = true;
    }
  }

  // Steps.

  /** A caption, with time to read it before the step it names. */
  *say(text) {
    this.caption = text;
    yield* this.wait(Math.min(1600, 500 + text.length * 18));
  }

  *wait(ms) {
    for (let t = 0; t < ms; ) t += yield;
  }

  *find(target) {
    for (let t = 0; t < 1500; t += yield) {
      const p = this.screen.texts && target(this.screen);
      if (p) return p;
    }
    throw new Error('nothing to point at');
  }

  point(x, y) {
    const s = this.screen;
    this.x = x;
    this.y = y;
    s.mx = Math.round(x);
    s.my = Math.round(y);
    if (this.held) s.mouseDragged({ x: s.mx, y: s.my, ...this.mods });
  }

  *move(target, ms) {
    const to = yield* this.find(target), fx = this.x, fy = this.y;
    ms ??= Math.min(900, Math.max(320, 260 + Math.hypot(to.x - fx, to.y - fy) * 2.5));
    for (let t = 0; t < ms; ) {
      t += yield;
      const k = ease(Math.min(1, t / ms));
      this.point(fx + (to.x - fx) * k, fy + (to.y - fy) * k);
    }
    // A beat to hover, so what hover shows is drawn and clickable.
    yield* this.wait(140);
  }

  press(button, mods, double) {
    const s = this.screen;
    this.ring = 0;
    s.mouseClicked({ x: s.mx, y: s.my, ...mods, button, double });
  }

  /** {@code opts}: right for a right-click, double for a double click, shift and ctrl to hold them (ctrl shown as Cmd on a Mac). */
  *click(target, opts = {}) {
    if (target) yield* this.move(target);
    const mods = { shift: !!opts.shift, ctrl: !!opts.ctrl, alt: false };
    if (mods.ctrl || mods.shift) this.showKeys([mods.ctrl && CMD, mods.shift && 'Shift', 'click'].filter(Boolean).join(' '));
    const button = opts.right ? 2 : 0;
    this.press(button, mods, false);
    yield* this.wait(90);
    if (button === 0) this.screen.mouseReleased({ x: this.screen.mx, y: this.screen.my, ...mods });
    if (opts.double) {
      yield* this.wait(110);
      this.press(0, mods, true);
      yield* this.wait(90);
      this.screen.mouseReleased({ x: this.screen.mx, y: this.screen.my, ...mods });
    }
    yield* this.wait(opts.after ?? 450);
  }

  *drag(from, to, ms = 900) {
    yield* this.move(from);
    this.press(0, this.mods, false);
    this.held = true;
    yield* this.wait(120);
    yield* this.move(to, ms);
    yield* this.wait(160);
    this.held = false;
    this.screen.mouseReleased({ x: this.screen.mx, y: this.screen.my, ...this.mods });
    yield* this.wait(450);
  }

  /** A key, as {@code 'ArrowDown'} or {@code 'a'}, with mods as for click. */
  *key(key, opts = {}) {
    const mods = { shift: !!opts.shift, ctrl: !!opts.ctrl, alt: false };
    this.showKeys([mods.ctrl && CMD, mods.shift && 'Shift', KEY_NAMES[key] || key.toUpperCase()].filter(Boolean).join(' '));
    this.screen.keyPressed({ key, ...mods });
    yield* this.wait(opts.after ?? 420);
  }

  *type(text) {
    for (const c of text) {
      this.screen.charTyped(c);
      yield* this.wait(95);
    }
    yield* this.wait(250);
  }

  *scroll(target, lines, ms = 700) {
    yield* this.move(target);
    const step = Math.sign(lines), n = Math.abs(lines);
    for (let i = 0; i < n; i++) {
      this.screen.mouseScrolled(this.screen.mx, this.screen.my, 0, -step, false);
      yield* this.wait(ms / n);
    }
  }

  showKeys(text) {
    this.keycap = text;
    this.keycapLeft = 1100;
  }

  // Drawing, over the frame.

  draw(g) {
    if (this.ring >= 0) {
      const k = this.ring / 360, r = 2 + k * 7, ctx = g.ctx;
      ctx.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.8})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.keycap && this.keycapLeft > 0) {
      const w = g.font.width(this.keycap) + 12, x = this.screen.width - w - 10, y = 10;
      g.fill(x - 1, y - 1, x + w + 1, y + 17, 0xFF5A5A5A);
      g.fill(x, y, x + w, y + 16, 0xFF1E1E1E);
      g.fill(x, y + 14, x + w, y + 16, BLACK);
      g.text(this.keycap, x + 6, y + 4, WHITE);
    }
    const x = Math.round(this.x), y = Math.round(this.y);
    CURSOR.forEach((line, r) => {
      for (let c = 0; c < line.length; c++) {
        if (line[c] !== '.') g.fill(x + c, y + r, x + c + 1, y + r + 1, line[c] === 'O' ? BLACK : WHITE);
      }
    });
  }
}

const KEY_NAMES = { ArrowDown: '↓', ArrowUp: '↑', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Enter: 'Enter', ' ': 'Space',
  Backspace: '⌫', Delete: 'Delete', End: 'End' };

const CURSOR = [
  'O',
  'OO',
  'OXO',
  'OXXO',
  'OXXXO',
  'OXXXXO',
  'OXXXXXO',
  'OXXXXXXO',
  'OXXXXXXXO',
  'OXXXXXOOOO',
  'OXXOXXO',
  'OXO.OXXO',
  'OO..OXXO',
  '.....OXXO',
  '.....OXXO',
  '......OO',
];

// --------------------------------------------------------------- scripts

/** Each script plays on a fresh player; {@code page} and {@code mode} on the element set where it starts. */
export const SCRIPTS = {
  // The whole screen: play a song, queue two, add one to a playlist, open a page from the library.
  *tour(d) {
    yield* d.say('Double-click a song to play it.');
    yield* d.click(row(2), { double: true, after: 1400 });
    yield* d.say('Hover a song and press + to queue it. The queue is on the right.');
    yield* d.click(plus(1), { after: 600 });
    yield* d.click(plus(3), { after: 1400 });
    yield* d.say('Right-click a song for everything else, such as adding it to a playlist.');
    yield* d.click(row(3), { right: true, after: 500 });
    yield* d.click(label('Add to playlist'), { after: 600 });
    // Across to the submenu first: crossing the menu's other rows would close it.
    yield* d.move(at(s => { const f = label('Find a playlist')(s); return f && { x: f.x, y: s.my }; }));
    yield* d.click(label('Evening build'), { after: 1400 });
    yield* d.say('The library on the left opens your pages and Settings.');
    yield* d.click(label('Liked Songs'), { after: 1600 });
    yield* d.click(label('Settings'), { after: 2200 });
  },

  // Home, top to bottom.
  *home(d) {
    const middle = at(s => ({ x: s.width * 0.55, y: s.height * 0.5 }));
    yield* d.say('Home starts with the lists you played lately.');
    yield* d.wait(900);
    yield* d.say('Then your top songs, your top artists and radio for you.');
    yield* d.scroll(middle, 12, 1600);
    yield* d.wait(1600);
  },

  // Your Stats, top to bottom.
  *stats(d) {
    const middle = at(s => ({ x: s.width * 0.5, y: s.height * 0.5 }));
    yield* d.say('Your Stats starts with how much you listened.');
    yield* d.wait(900);
    yield* d.say('Then your top songs, when you listen, and where.');
    yield* d.scroll(middle, 14, 2200);
    yield* d.wait(1600);
  },

  // Settings: the mode, then the rest of the page.
  *settings(d) {
    const middle = at(s => ({ x: s.width * 0.5, y: s.height * 0.5 }));
    yield* d.say('Mode picks what the mod plays.');
    yield* d.click(label('Add-ons'), { after: 1300 });
    yield* d.click(label('Vanilla + FX'), { after: 1300 });
    yield* d.say('Below it are playback, effects and the equalizer.');
    yield* d.scroll(middle, 14, 2200);
    yield* d.click(label('Bass Booster'), { after: 1800 });
  },

  // The bottom bar, from the keyboard.
  *controls(d) {
    yield* d.say('Space plays or pauses.');
    yield* d.key(' ', { after: 1000 });
    yield* d.key(' ', { after: 1000 });
    yield* d.say(`${CMD} → plays the next song.`);
    yield* d.key('ArrowRight', { ctrl: true, after: 1200 });
    yield* d.say(`${CMD} S shuffles, and ${CMD} R repeats.`);
    yield* d.key('s', { ctrl: true, after: 1000 });
    yield* d.key('r', { ctrl: true, after: 1400 });
  },

  // Selecting songs: click, Shift and arrows, Cmd-click, one menu for all of them, Esc.
  *select(d) {
    yield* d.say('Click a song to select it.');
    yield* d.click(row(1));
    yield* d.say('Shift ↓ selects the next one too.');
    for (let i = 0; i < 3; i++) yield* d.key('ArrowDown', { shift: true, after: 380 });
    yield* d.say(`${CMD}-click adds a song, or drops one.`);
    yield* d.click(row(6), { ctrl: true, after: 900 });
    yield* d.say('Right-click a selected song: one menu for all of them.');
    yield* d.click(row(3), { right: true, after: 2000 });
    yield* d.say('Esc closes the menu, then clears the selection.');
    yield* d.key('Escape', { after: 700 });
    yield* d.key('Escape', { after: 1500 });
  },

  // A playlist: drag a song, rename, sort.
  *playlist(d) {
    yield* d.say('Drag a song to move it.');
    yield* d.drag(row(0), row(3));
    yield* d.wait(500);
    yield* d.say('Click the name to rename it.');
    yield* d.click(label('Evening build'), { after: 300 });
    yield* d.type('Night build');
    yield* d.key('Enter', { after: 1200 });
    yield* d.say('Sorting by a column turns moving off. Click it again to flip it, a third time to go back.');
    yield* d.click(label('Title', 0), { after: 1500 });
    yield* d.click(label('Title', 0), { after: 1500 });
    yield* d.click(label('Title', 0), { after: 1500 });
  },

  // The queue, beside a page.
  *queue(d) {
    yield* d.say('Press + on a song to queue it.');
    yield* d.click(plus(3), { after: 500 });
    yield* d.click(plus(5), { after: 500 });
    yield* d.click(plus(7), { after: 1000 });
    yield* d.say('Queued songs play next. Drag one to reorder.');
    yield* d.drag(queueRow(2), queueRow(0), 700);
    yield* d.wait(700);
    yield* d.say('× takes one out.');
    yield* d.click(at(s => s.queueRows > 1 && { x: s.queueX1 - 9, y: s.queueTop + QROW + QROW / 2 }), { after: 1000 });
    yield* d.say(`Next (${CMD} →) plays the queue, then the page, then the game's next song.`);
    yield* d.key('ArrowRight', { ctrl: true, after: 1500 });
    yield* d.key('ArrowRight', { ctrl: true, after: 1800 });
  },

  // An add-on pack as a mix: open a transition, move the next song, try presets, save.
  *mix(d) {
    yield* d.say('Click a transition to edit it.');
    yield* d.click(label('Blend', 0), { after: 1200 });
    yield* d.say('Drag a song to move it a beat at a time.');
    const lane = dx => at(s => {
      const bars = label('bars')(s);
      return bars && { x: bars.x + 60 + dx, y: bars.y - 34 };
    });
    yield* d.drag(lane(0), lane(-48), 1100);
    yield* d.wait(800);
    yield* d.say('Or pick a preset to start over.');
    yield* d.click(label('Fade', -1), { after: 1400 });
    yield* d.click(label('Rise', -1), { after: 1400 });
    yield* d.say('Save keeps it for this pair of songs.');
    yield* d.click(label('Save'), { after: 2000 });
  },
};
