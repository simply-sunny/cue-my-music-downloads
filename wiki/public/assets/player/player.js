// Mounts the web player on each <div class="cmm-player"> on the page:
//
//   <div class="cmm-player" data-page="SETTINGS" data-parts="center"></div>
//   <div class="cmm-player" data-demo="select" data-parts="center"></div>
//   <div class="cmm-player" data-demo="tour" data-interactive></div>
//
// data-page opens a page as CueScreen names them (HOME, SETTINGS, STATS, SEARCH, RADIO, LIKED, PLAYLIST,
// LIST:<id>, ARTIST:<name>, PACK:<id>, POOL:<id>); data-mode is fx, addons or vanilla; data-parts shows some of the screen
// (library, center, now, bar; all of it if left out); data-height is the GUI height in pixels (16:9, or at least 270 on a
// narrow page, unless set). data-demo plays a script from demos.js instead of taking input; with data-interactive, its Try it button hands it over. Each player is its own copy of
// the mod, drawn at a whole-number GUI scale like the game's, with the game's textures pulled from Mojang. There is no sound.

import { Font } from './gfx.js';
import { Library, Player, Stats, defaultConfig, STRINGS, tr, ALL } from './model.js';
import { pullFont, pullGameFiles } from './assets.js';
import { CueScreen, BOTTOM, GAP } from './screen.js';
import { Demo, SCRIPTS } from './demos.js';
import './pages.js';
import './mix.js';
import './stats.js';
import './side.js';

const BASE = new URL('.', import.meta.url);
const GUI_WIDTH = 480;
const MIN_GUI_HEIGHT = 256;
// Under this width, or in a stranger shape, a demo says so rather than show a squeezed screen.
const MIN_WIDTH = 480, MIN_ASPECT = 4 / 3, MAX_ASPECT = 21 / 9;

let shared;
/** The data, the font and the game's files, loaded once for every player on the page. */
function load() {
  shared ??= (async () => {
    const font = new Font();
    const data = await fetch(new URL('data.json', BASE)).then(r => r.json());
    font.load(await pullFont(data.source));
    const textures = new Map();
    // The library first, so strings exist; the game's biome names join them as they arrive.
    const files = pullGameFiles(data.source, textures, STRINGS);
    return { data, font, textures, files };
  })();
  return shared;
}

async function mount(root) {
  root.classList.add('is-loading');
  // data-panel adds an add-on's page, from that file beside this one.
  const panel = root.dataset.panel && (await import(new URL(root.dataset.panel + '.js', BASE))).default;
  const script = root.dataset.demo ? SCRIPTS[root.dataset.demo] : null;
  if (root.dataset.demo && !script) throw new Error('no demo named ' + root.dataset.demo);
  const parts = root.dataset.parts ? new Set(root.dataset.parts.split(',').map(p => p.trim())) : null;
  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  const bar = document.createElement('div');
  bar.className = 'cmm-player__bar';
  const note = document.createElement('span');
  note.className = 'cmm-player__note';
  const notice = document.createElement('p');
  notice.className = 'cmm-player__notice';
  // A demo has play/pause and restart, and its caption.
  const pause = button('cmm-player__pause', 'Pause');
  const restart = button('cmm-player__restart', 'Restart');
  const tryIt = button('cmm-player__try', 'Try it');
  const takesOver = !!script && 'interactive' in root.dataset;
  const touch = matchMedia('(pointer: coarse)').matches;
  if (script) {
    root.classList.add('is-demo');
    canvas.setAttribute('role', 'img');
    canvas.removeAttribute('tabindex');
    if (takesOver) bar.append(pause, tryIt, note, restart);
    else bar.append(pause, note, restart);
  } else {
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', 'A working copy of the player');
  }
  root.replaceChildren(canvas, ...(bar.children.length ? [bar] : []), notice);

  const { data, font, textures } = await load();
  // Its own songs, as a demo changes them.
  const lib = new Library(data);
  let cfg, player, screen;
  /** A fresh copy of the mod, on the element's page. */
  const build = () => {
    const keep = screen && { width: screen.width, height: screen.height };
    cfg = defaultConfig(lib);
    if (root.dataset.mode === 'vanilla') cfg.vanilla = true;
    else if (root.dataset.mode) cfg.mode = root.dataset.mode;
    const stats = new Stats(lib);
    player = new Player(lib, cfg, stats);
    const panels = panel ? [panel({ lib, textures })] : [];
    screen = new CueScreen({ lib, cfg, player, stats, font, textures, panels });
    screen.parts = parts;
    if (keep) Object.assign(screen, keep);
    // Something on, paused, so the player isn't empty: the game's song, or the example pack in Add-ons.
    if (player.mode() === 'addons') player.playAll('pack:' + lib.packs[0].id, player.only(lib.addOnMusic()));
    else if (player.mode() === 'fx') player.playUpcoming();
    if (player.current) {
      player.position = Math.min(42, player.current.seconds / 3);
      player.paused = true;
    }
    screen.start(root.dataset.page || 'HOME');
    self.screen = screen;
    self.player = player;
  };
  const self = { root };
  build();
  root.classList.remove('is-loading');

  // A demo runs while on screen, and starts over a moment after it ends. With reduced motion it waits to be played.
  const tour = script && takesOver ? function* (d) {
    yield* script(d);
    yield* d.say('Now press Try it.');
    yield* d.wait(4000);
  } : script;
  let demo = tour && new Demo(tour);
  let demoPaused = !!demo && matchMedia('(prefers-reduced-motion: reduce)').matches, restartIn = -1;
  if (demo) {
    demo.start(screen);
    canvas.setAttribute('aria-label', 'An animation of the player. The caption under it says what it shows.');
  }
  const showPaused = () => {
    pause.textContent = demoPaused ? 'Play' : 'Pause';
    pause.setAttribute('aria-pressed', String(demoPaused));
  };
  showPaused();
  const replay = () => {
    build();
    demo = new Demo(tour);
    demo.start(screen);
    restartIn = -1;
    demoPaused = false;
    pause.hidden = false;
    tryIt.hidden = false;
    canvas.removeAttribute('tabindex');
    root.classList.add('is-demo');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'An animation of the player. The caption under it says what it shows.');
    showPaused();
  };
  /** Hands over to the person: the script stops and the real pointer takes over. */
  const takeOver = () => {
    if (!demo || !takesOver) return;
    demo = null;
    demoPaused = false;
    root.classList.remove('is-demo');
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', 'A working copy of the player');
    note.textContent = root.dataset.prompt || (touch ? "It's yours. Tap anything. There's no sound." : "It's yours. Click anything. There's no sound.");
    pause.hidden = true;
    tryIt.hidden = true;
    canvas.tabIndex = 0;
    canvas.focus({ preventScroll: true });
  };
  pause.addEventListener('click', () => {
    demoPaused = !demoPaused;
    showPaused();
  });
  restart.addEventListener('click', replay);
  tryIt.addEventListener('click', takeOver);

  // Size: a whole-number scale that makes the GUI about 480 pixels wide, as the game picks its GUI scale.
  let scale = 1, tooSmall = false;
  const resize = () => {
    const dpr = window.devicePixelRatio || 1, cssW = root.clientWidth, fullscreen = document.fullscreenElement === root;
    const aspect = cssW / root.clientHeight;
    tooSmall = cssW < MIN_WIDTH || fullscreen && (aspect < MIN_ASPECT || aspect > MAX_ASPECT);
    root.classList.toggle('is-too-small', tooSmall);
    notice.textContent = cssW < MIN_WIDTH
      ? 'Not shown on this display. This demo needs a wider window.'
      : 'Not shown on this display. This demo needs a window closer to 16:9.';
    const devW = Math.round(cssW * dpr);
    // 16:9 on a 24-pixel grid, to match the other wikis' demos.
    const fitted = Math.floor(cssW * 9 / 16 / 24) * 24 * dpr;
    // Never under a CSS pixel per GUI pixel, so a phone shows a narrower GUI rather than tiny text.
    scale = Math.max(1, Math.min(Math.round(devW / GUI_WIDTH), Math.floor(fitted / MIN_GUI_HEIGHT)), Math.round(dpr));
    // The screen's outer gap hangs outside the page's column, so the panels line up with the text.
    const hang = fullscreen ? 0 : GAP;
    screen.width = Math.floor(devW / scale) + hang * 2;
    screen.height = fullscreen ? Math.floor((root.clientHeight - bar.offsetHeight) * dpr / scale)
      : Number(root.dataset.height) || (parts && parts.size === 1 && parts.has('bar') ? BOTTOM + 30
        : Math.floor(fitted / scale));
    // On the page's 8px grid, so what follows the player stays on it (docs/LAYOUT.md in the templates).
    if (!fullscreen) {
      for (let h = screen.height; h > screen.height - 32; h--) {
        const css = h * scale / dpr;
        if (Math.abs(css / 8 - Math.round(css / 8)) < 1e-6) {
          screen.height = h;
          break;
        }
      }
    }
    canvas.width = screen.width * scale;
    canvas.height = screen.height * scale;
    canvas.style.width = canvas.width / dpr + 'px';
    canvas.style.height = canvas.height / dpr + 'px';
    canvas.style.marginLeft = -hang * scale / dpr + 'px';
  };
  new ResizeObserver(resize).observe(root);
  resize();

  // Input, in GUI pixels.
  const at = e => {
    const r = canvas.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) / r.width * screen.width), y: Math.floor((e.clientY - r.top) / r.height * screen.height) };
  };
  const mods = e => ({ shift: e.shiftKey, ctrl: e.metaKey || e.ctrlKey, alt: e.altKey });
  canvas.addEventListener('pointermove', e => {
    if (demo) return;
    const p = at(e);
    screen.mx = p.x;
    screen.my = p.y;
    if (e.buttons & 1) screen.mouseDragged({ ...p, ...mods(e) });
    canvas.style.cursor = screen.clickable(p.x, p.y) ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', () => {
    if (demo) return;
    screen.mx = screen.my = -1;
  });
  canvas.addEventListener('pointerdown', e => {
    if (demo) return;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    const p = at(e);
    screen.mx = p.x;
    screen.my = p.y;
    screen.mouseClicked({ ...p, ...mods(e), button: e.button, double: e.detail >= 2 });
    e.preventDefault();
  });
  canvas.addEventListener('pointerup', e => {
    if (demo) return;
    if (e.button === 0) screen.mouseReleased({ ...at(e), ...mods(e) });
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => {
    if (demo) return;
    const p = at(e), unit = e.deltaMode === 1 ? 1 : 100;
    if (screen.mouseScrolled(p.x, p.y, -e.deltaX / unit, -e.deltaY / unit, e.shiftKey)) e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('keydown', e => {
    if (demo) return;
    const ev = { key: e.key.length === 1 && (e.metaKey || e.ctrlKey) ? e.key.toLowerCase() : e.key, ...mods(e) };
    let used = screen.keyPressed(ev);
    if (!used && e.key.length === 1 && !e.metaKey && !e.ctrlKey) used = screen.charTyped(e.key);
    if (used) e.preventDefault();
  });

  // Drawn only while on screen.
  let visible = false, last = performance.now();
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) requestAnimationFrame(frame);
  }).observe(root);
  const ctx = canvas.getContext('2d');
  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (demo && !demoPaused && !tooSmall) {
      if (demo.done) {
        if (restartIn < 0) restartIn = 2500;
        restartIn -= dt * 1000;
        if (restartIn <= 0) {
          restartIn = -1;
          build();
          demo.start(screen);
        }
      } else {
        demo.tick(dt * 1000);
      }
    }
    if (!demo || !demoPaused) player.tick(dt);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    screen.render(ctx);
    if (demo) {
      demo.draw(screen.g);
      note.textContent = demoPaused && !demo.caption ? 'Paused' : demo.caption;
    }
    if (visible || document.fullscreenElement === root) requestAnimationFrame(frame);
  }
}

function button(className, label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  return b;
}

for (const root of document.querySelectorAll('.cmm-player')) {
  mount(root).catch(e => {
    root.classList.remove('is-loading');
    root.classList.add('is-failed');
    root.textContent = "The player didn't load.";
    console.error('[cue-player]', e);
  });
}

export { tr, ALL };
