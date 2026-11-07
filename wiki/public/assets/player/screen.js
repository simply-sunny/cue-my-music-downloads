// CueScreen in a canvas: the library on the left, the open page in the middle, now playing and the queue on the
// right, and play controls along the bottom. Ported from the mod's CueScreen, draw call for draw call; clicks and
// drags hit the regions recorded while drawing the previous frame. The other pages are in pages.js, side.js,
// mix.js and stats.js.

import { LINE, Graphics, pixels, searchIcon, roundButton, playIcon, pauseIcon, clockIcon, arrow, dislikeIcon, heartIcon,
  shuffleIcon, plusIcon, equalizerIcon, menuIcon as drawMenuIcon } from './gfx.js';
import { tr, has, block, initialsArt, gradient, normalize, terms, matches, clamp, moved, ALL, RADIO } from './model.js';

export const BLACK = 0xFF000000, PANEL = 0xFF121212, ROW_HOVER = 0xFF2A2A2A, SELECTED = 0xFF232323, WHITE = 0xFFFFFFFF,
  DIM = 0xFFB3B3B3, FAINT = 0xFF6A6A6A, GREEN = 0xFF1ED760, RED = 0xFFFF6B6B, TRACK_BG = 0xFF4D4D4D;
export const GAP = 4, BOTTOM = 42, ROW = 20, QROW = 13, LIB_ROW = 12, LIB_SECTION = 14;
export const PLAYLIST_ART = block('block/jukebox_top'), SETTINGS_ART = block('block/crafting_table_top'),
  STATS_ART = block('block/cartography_table_top'), RADIO_ART = block('block/jukebox_side');
export const LIKED_ART = { sprite: 'sprites/hud/heart/full', top: 0xFF5A3BD6, bottom: 0xFF8FB6E0 };
export const DISLIKED_ART = { text: '⊘', top: 0xFF5A2A2A, bottom: 0xFF3A1E1E };
const NEW_PLAYLIST_ART = { text: '+', top: 0xFF2E2E2E, bottom: 0xFF242424 };
const TOAST_MILLIS = 1500;
const MENU_ROW = 18, MENU_DIVIDER = 7, MENU_PAD = 4, SUB_WIDTH = 160, SUB_ROWS = 8, MENU_BG = 0xFF282828, MENU_HOVER = 0xFF3E3E3E,
  MENU_LINE = 0xFF3A3A3A;
const LIBRARY_SORTS = ['recents', 'alphabetical', 'default'];
export const MODES = ['vanilla', 'fx', 'addons'];
const PAGE_FILTER = 'page-filter', PLAYLIST_FIND = 'playlist_find';
const DOUBLE_CLICK_MILLIS = 400;

export const DIVIDER = { icon: 'none', label: null };
const FIELD = { icon: 'none', label: '' };
const item = (icon, label, action, pick = null) => ({ icon, label, action, pick });
export const menuItem = item;

const inside = (r, x, y) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
const dragContains = (d, x, y) => x >= Math.max(d.x0, d.clipX0) && x < Math.min(d.x1, d.clipX1) && y >= Math.max(d.y0, d.clipY0)
  && y < Math.min(d.y1, d.clipY1);
const dragFraction = (d, x, y) => clamp(d.vertical ? 1 - (y - d.y0) / (d.y1 - d.y0) : (x - d.x0) / (d.x1 - d.x0), 0, 1);

/** "+1", "-1" or "0". */
export const signed = v => (v > 0 ? '+' : '') + v;
export function time(seconds) {
  const s = Math.floor(seconds);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
export function longDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? tr('cuemymusic.duration.hours', Math.floor(minutes / 60), minutes % 60) : tr('cuemymusic.duration.minutes', minutes);
}

/** EditBox: one line of text with a cursor, as the game draws it. */
export class EditBox {
  constructor(font, w, h, hint, bordered = true) {
    Object.assign(this, { font, x: 0, y: 0, w, h, hint, bordered, value: '', cursor: 0, select: 0, focused: false, maxLength: 32 });
  }

  setValue(v) {
    this.value = v.slice(0, this.maxLength);
    this.cursor = this.select = this.value.length;
  }

  insert(s) {
    const a = Math.min(this.cursor, this.select), b = Math.max(this.cursor, this.select);
    this.value = (this.value.slice(0, a) + s + this.value.slice(b)).slice(0, this.maxLength);
    this.cursor = this.select = Math.min(this.value.length, a + s.length);
  }

  keyPressed(e) {
    const word = e.ctrl || e.alt;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (this.cursor === this.select) {
        if (e.key === 'Backspace') this.select = word ? this.value.lastIndexOf(' ', this.cursor - 2) + 1 : Math.max(0, this.cursor - 1);
        else this.select = Math.min(this.value.length, this.cursor + 1);
      }
      this.insert('');
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
      const to = e.key === 'Home' ? 0 : e.key === 'End' ? this.value.length
        : clamp(this.cursor + (e.key === 'ArrowLeft' ? -1 : 1), 0, this.value.length);
      this.cursor = to;
      if (!e.shift) this.select = to;
    } else if (e.ctrl && e.key.toLowerCase() === 'a') {
      this.select = 0;
      this.cursor = this.value.length;
    } else {
      return false;
    }
    return true;
  }

  charTyped(c) {
    this.insert(c);
    return true;
  }

  mouseClicked(x) {
    const tx = this.bordered ? this.x + 4 : this.x;
    const shown = this.font.substrByWidth(this.value, this.w - (this.bordered ? 8 : 0));
    this.cursor = this.select = this.font.substrByWidth(shown, x - tx).length;
  }

  isMouseOver(x, y) {
    return x >= this.x && x < this.x + this.w && y >= this.y && y < this.y + this.h;
  }

  draw(g) {
    const f = this.font;
    if (this.bordered) {
      g.fill(this.x - 1, this.y - 1, this.x + this.w + 1, this.y + this.h + 1, this.focused ? WHITE : 0xFFA0A0A0);
      g.fill(this.x, this.y, this.x + this.w, this.y + this.h, BLACK);
    }
    const tx = this.bordered ? this.x + 4 : this.x, ty = this.bordered ? this.y + (this.h - 8) / 2 : this.y, w = this.w - (this.bordered ? 8 : 0);
    // Scrolled so the cursor shows.
    let from = 0;
    while (f.width(this.value.slice(from, this.cursor)) > w) from++;
    const shown = f.substrByWidth(this.value.slice(from), w);
    if (!this.value && !this.focused && this.hint) g.text(this.hint, tx, ty, FAINT, this.bordered);
    const a = Math.min(this.cursor, this.select) - from, b = Math.max(this.cursor, this.select) - from;
    if (a !== b && this.focused) g.fill(tx + f.width(shown.slice(0, Math.max(0, a))), ty - 1, tx + f.width(shown.slice(0, b)), ty + 10, 0xFF0000FF);
    g.text(shown, tx, ty, this.bordered ? 0xFFE0E0E0 : WHITE, this.bordered);
    if (this.focused && Math.floor(Date.now() / 300) % 2 === 0) {
      const cx = tx + f.width(shown.slice(0, this.cursor - from));
      if (this.cursor < this.value.length) g.fill(cx, ty - 1, cx + 1, ty + 10, 0xFFD0D0D0);
      else g.text('_', cx, ty, 0xFFE0E0E0, this.bordered);
    }
  }
}

export class CueScreen {
  constructor({ lib, cfg, player, stats, font, textures, panels = [] }) {
    Object.assign(this, { lib, cfg, player, stats, font, textures, panels });
    this.width = 480;
    this.height = 270;
    this.hits = [];
    this.drags = [];
    this.rowHits = [];
    this.libraryMenus = [];
    this.fieldHits = [];
    this.dragging = null;
    this.view = 'PLAYLIST';
    this.key = null;
    this.sort = 'NONE';
    this.ascending = true;
    this.scroll = 0;
    this.scrollMax = 0;
    this.seekPreview = -1;
    this.toast = null;
    this.toastUntil = 0;
    this.menu = null;
    this.menuFilter = '';
    this.subOpen = false;
    this.subScroll = 0;
    this.renameBox = null;
    this.renamingId = null;
    this.resetArmedUntil = 0;
    this.resetArmedAt = 0;
    this.searchQuery = '';
    this.focusSearch = false;
    this.mixTracks = [];
    this.mixFrom = this.mixTo = null;
    this.mixEdit = -1;
    this.mixLaneScroll = this.mixLaneScrollNext = null;
    this.mixScrollRest = 0;
    this.mixDraft = null;
    this.laneDrag = 0;
    this.presetScroll = 0;
    this.presetScrollMax = 0;
    this.fields = new Map();
    this.fieldSubmits = new Map();
    this.focusedField = null;
    this.selected = new Set();
    this.anchor = this.focusRow = -1;
    this.selectDragging = false;
    this.pressed = null;
    this.reordering = false;
    this.pageFilterOpen = false;
    this.focusPageFilter = false;
    this.shownTracks = [];
    this.shownTop = 0;
    this.libraryScroll = 0;
    this.libraryScrollMax = 0;
    this.queueRows = this.queueFit = 0;
    this.queueScroll = 0;
    this.queueDrag = -1;
    this.nextFromDrag = -1;
    this.gamePool = null;
    this.lastRowClick = null;
    this.lastRowClickAt = 0;
    this.rowListKey = null;
    this.rowList = [];
    this.unmutedVolume = 1;
    this.mx = this.my = -1;
  }

  /** Opens on a page, as init() opens on the last one. */
  start(page) {
    const [v, k] = page.includes(':') ? [page.slice(0, page.indexOf(':')), page.slice(page.indexOf(':') + 1)] : [page, null];
    if (v === 'SEARCH') this.openSearch();
    else this.open(v, k);
  }

  // The config's operations, as CueConfig has them.

  playlist(id) {
    return this.cfg.playlists.find(p => p.id === id) || null;
  }

  createPlaylist(name) {
    let id = Date.now().toString(36);
    while (this.playlist(id)) id += 'x';
    this.cfg.playlists = [...this.cfg.playlists, { id, name, songs: [] }];
    return id;
  }

  replacePlaylist(id, change) {
    this.cfg.playlists = this.cfg.playlists.map(p => (p.id === id ? change(p) : p));
  }

  addToPlaylist(id, song) {
    const p = this.playlist(id);
    if (!p || p.songs.includes(song)) return false;
    this.replacePlaylist(id, p => ({ ...p, songs: [...p.songs, song] }));
    return true;
  }

  removeFromPlaylist(id, song) {
    this.replacePlaylist(id, p => ({ ...p, songs: p.songs.filter(s => s !== song) }));
  }

  isCollapsed(id) {
    return this.cfg.collapsed.includes(id);
  }

  toggleCollapsed(id) {
    const c = this.cfg.collapsed;
    this.cfg.collapsed = c.includes(id) ? c.filter(x => x !== id) : [...c, id];
  }

  isMixPage(k) {
    return this.cfg.mixPages.includes(k);
  }

  setMixPage(k, on) {
    this.cfg.mixPages = [...this.cfg.mixPages.filter(x => x !== k), ...(on ? [k] : [])];
  }

  /** Text that fits as is, or cut to fit and ended in "...". */
  clip(s, maxWidth) {
    const f = this.font;
    return maxWidth <= 0 ? '' : f.width(s) <= maxWidth ? s : f.substrByWidth(s, Math.max(0, maxWidth - f.width('...'))) + '...';
  }

  hoverColor(x, y, w, h) {
    return this.mx >= x && this.mx < x + w && this.my >= y && this.my < y + h ? WHITE : DIM;
  }

  hit(x0, y0, x1, y1, click) {
    this.nextHits.push({ x0, y0, x1, y1, click });
  }

  drag(x0, y0, x1, y1, vertical, onFraction, onRelease) {
    this.nextDrags.push({ x0, y0, x1, y1, vertical, onFraction, onRelease, clipX0: x0, clipY0: y0, clipX1: x1, clipY1: y1 });
  }

  // ---------------------------------------------------------------- frame

  render(ctx) {
    const g = new Graphics(ctx, this.font, this.textures), mx = this.mx, my = this.my;
    this.g = g;
    g.base = ctx.getTransform().a;
    if (this.recordTexts) g.texts = [];
    this.nextHits = [];
    this.nextDrags = [];
    this.nextRowHits = [];
    this.nextLibraryMenus = [];
    this.nextFieldHits = [];
    this.nextMixLaneScroll = this.nextMixLaneScrollNext = null;
    g.fill(0, 0, this.width, this.height, BLACK);
    if (this.cfg.vanilla) {
      this.drawVanilla(g, mx, my);
    } else {
      // The web player can show some of the screen: any of the library, the centre, now playing and the bottom bar, laid out as
      // the whole screen lays them out, a part shown alone taking the width.
      const has = part => !this.parts || this.parts.has(part);
      const lib = has('library'), center = has('center'), now = has('now'), bar = has('bar');
      const width = this.width, height = this.height;
      const sideW = !lib ? 0 : center || now ? clamp(Math.floor(width / 5), 92, 150) : width - GAP * 2;
      // Now playing gives way on a narrow screen, unless it's a part asked for.
      const rightW = !now ? 0 : !center && !lib ? width - GAP * 2 : width >= 400 || this.parts ? clamp(Math.floor(width / 5), 96, 150) : 0;
      // The bar alone keeps a strip above it for its toasts.
      const top = GAP, bottom = bar ? height - BOTTOM : height;
      if (lib) this.drawLibrary(g, GAP, top, GAP + sideW, bottom - GAP, mx, my);
      this.centerX0 = lib ? GAP * 2 + sideW : GAP;
      this.centerX1 = width - GAP - (rightW > 0 ? rightW + GAP : 0);
      this.centerY0 = top;
      this.centerY1 = bottom - GAP;
      if (center) {
        // Dragging a selection or a song to the list's top or bottom edge, or past it, scrolls the list.
        if (this.selectDragging || this.reordering) {
          if (my < this.centerY0 + 10) this.scroll = Math.max(0, this.scroll - 6);
          else if (my > this.centerY1 - 10) this.scroll = Math.min(this.scrollMax, this.scroll + 6);
        }
        this.drawCenter(g, mx, my);
        if (this.selectDragging) {
          const row = this.rowAt(my);
          if (row >= 0 && row !== this.focusRow) {
            this.focusRow = row;
            this.selectRange(this.anchor, row);
          }
        }
      }
      if (rightW > 0) {
        this.drawNowPlaying(g, width - GAP - rightW, top, width - GAP, bottom - GAP, mx, my);
      } else {
        this.queueRows = 0;
        this.queueFit = 0;
      }
      if (bar) this.drawBottomBar(g, 0, bottom, width, height, mx, my);
      if (this.renameBox) this.renameBox.draw(g);
      if (center) {
        this.drawSelectionBar(g);
        this.drawReorder(g, mx, my);
      }
      this.drawMenu(g, mx, my);
      this.drawToast(g);
    }
    this.texts = g.texts;
    this.hits = this.nextHits;
    this.drags = this.nextDrags;
    this.rowHits = this.nextRowHits;
    this.libraryMenus = this.nextLibraryMenus;
    this.fieldHits = this.nextFieldHits;
    this.mixLaneScroll = this.nextMixLaneScroll;
    this.mixLaneScrollNext = this.nextMixLaneScrollNext;
  }

  /** With vanilla music on, the whole window is one card saying so, with a button to turn the mod back on. */
  drawVanilla(g, mx, my) {
    const width = this.width, height = this.height, font = this.font;
    this.centerX0 = 0;
    this.centerY0 = 0;
    this.centerX1 = width;
    this.centerY1 = height;
    g.fill(0, 0, width, height, BLACK);
    const w = Math.min(300, width - 40), x0 = Math.floor((width - w) / 2);
    const body = tr('cuemymusic.vanilla.body'), bodyH = font.wrapHeight(body, w - 28);
    const h = 64 + bodyH + 30, y0 = Math.floor((height - h) / 2);
    g.fill(x0, y0, x0 + w, y0 + h, PANEL);
    this.drawModeSwitch(g, x0, y0 - 40, x0 + w, mx, my);
    this.bigText(g, tr('cuemymusic.vanilla.title'), x0 + 14, y0 + 14, 2, WHITE);
    g.textWithWordWrap(body, x0 + 14, y0 + 40, w - 28, DIM);
    const c = new Canvas(this, g, x0 + 4, y0 + 48 + bodyH, x0 + w - 4, mx, my);
    const bw = c.button(c.left(), tr('cuemymusic.vanilla.off'), 'PRIMARY', true, () => this.setVanilla(false));
    c.button(c.left() + bw + 6, tr('cuemymusic.vanilla.close'), 'SECONDARY', true, () => this.setVanilla(false));
  }

  setVanilla(on) {
    if (this.cfg.vanilla === on) return;
    this.cfg.vanilla = on;
    this.player.modeChanged();
  }

  // ---------------------------------------------------------------- library

  drawLibrary(g, x0, y0, x1, y1, mx, my) {
    const cfg = this.cfg, lib = this.lib, view = this.view;
    g.fill(x0, y0, x1, y1, PANEL);
    g.text(this.clip(tr('cuemymusic.library'), x1 - x0 - 42), x0 + 6, y0 + 7, WHITE);
    // Search, at the right of the heading.
    const sx = x1 - 15, sy = y0 + 5;
    const searchHover = mx >= sx - 3 && mx < sx + 12 && my >= sy - 3 && my < sy + 12;
    searchIcon(g, sx, sy, view === 'SEARCH' ? GREEN : searchHover ? WHITE : DIM);
    this.hit(sx - 3, sy - 3, sx + 12, sy + 12, () => this.openSearch());
    // Home, left of search.
    const hx = sx - 15;
    const homeHover = mx >= hx - 3 && mx < hx + 12 && my >= sy - 3 && my < sy + 12;
    pixels(g, hx, sy, view === 'HOME' ? GREEN : homeHover ? WHITE : DIM,
      '....X....', '...XXX...', '..XXXXX..', '.XXXXXXX.', 'XXXXXXXXX', '.XX...XX.', '.XX...XX.', '.XX...XX.', '.XXXXXXX.');
    this.hit(hx - 3, sy - 3, hx + 12, sy + 12, () => this.open('HOME', null));

    const all = lib.gameMusic();
    // Each mode shows its own music: the game's artists, or the add-ons' artists and packs.
    const addons = this.mode() === 'addons';
    let artists = addons ? lib.packArtists() : lib.artistOrder.filter(a => lib.songsBy(a).length);
    let packs = lib.packs.filter(p => !this.panels.some(panel => panel.packId() === p.id)), playlists = cfg.playlists;
    const disliked = this.disliked();
    artists = this.librarySorted(artists, a => a, a => 'artist:' + a);
    packs = this.librarySorted(packs, p => p.name, p => 'pack:' + p.id);
    playlists = this.librarySorted(playlists, p => p.name, p => 'list:' + p.id);

    // Stats and Settings stay at the bottom; everything above them scrolls.
    const big = y1 - y0 > 200 ? 22 : 14;
    const settingsY = y1 - big - 2, statsY = settingsY - big;
    this.libraryX0 = x0;
    this.libraryX1 = x1;
    this.libraryTop = this.drawLibraryTools(g, x0, y0 + 18, x1, mx, my);
    this.libraryBottom = statsY - 2;
    g.enableScissor(x0, this.libraryTop, x1, this.libraryBottom);
    let y = this.libraryTop + 2 - Math.floor(this.libraryScroll);
    const start = y;

    if (!addons) {
      y = this.libraryItem(g, x0, y, x1, big, PLAYLIST_ART, tr('cuemymusic.playlist.title'), tr('cuemymusic.playlist.subtitle', all.length),
        view === 'PLAYLIST', mx, my, () => this.open('PLAYLIST', null), () => this.listMenu(ALL, all, null));
    }
    // Liked Songs is there once something is liked, like any playlist.
    const liked = this.liked();
    if (liked.length || view === 'LIKED') {
      y = this.libraryItem(g, x0, y, x1, big, LIKED_ART, tr('cuemymusic.liked.title'), tr('cuemymusic.playlist.subtitle', liked.length),
        view === 'LIKED', mx, my, () => this.open('LIKED', null), () => this.listMenu('liked', liked, null));
    }
    // Radio is for add-on songs; the game's music already comes on its own in Vanilla + FX.
    if (addons) {
      y = this.libraryItem(g, x0, y, x1, big, RADIO_ART, tr('cuemymusic.radio.title'), tr('cuemymusic.radio.subtitle'), view === 'RADIO',
        mx, my, () => this.open('RADIO', null), () => [item('radio', tr('cuemymusic.radio.start_all'), () => {
          this.player.startRadio(null);
          this.open('RADIO', null);
        })]);
    }
    if (disliked.length || view === 'DISLIKED') {
      y = this.libraryItem(g, x0, y, x1, big, DISLIKED_ART, tr('cuemymusic.disliked.title'),
        tr('cuemymusic.playlist.subtitle', disliked.length), view === 'DISLIKED', mx, my, () => this.open('DISLIKED', null));
    }
    for (const panel of addons ? this.panels : []) {
      y = this.libraryItem(g, x0, y, x1, big, panel.icon(), panel.title(), panel.subtitle(), view === 'PANEL' && panel.id() === this.key, mx, my,
        () => this.open('PANEL', panel.id()));
    }
    y += 4;

    if (artists.length) {
      y = this.librarySection(g, x0, y, x1, 'artists', tr('cuemymusic.section.artists'), artists.length, mx, my);
      if (!this.isCollapsed('artists')) {
        for (const a of artists) {
          y = this.libraryItem(g, x0, y, x1, LIB_ROW, this.artistArt(a), a, null, view === 'ARTIST' && a === this.key, mx, my,
            () => this.open('ARTIST', a), () => this.listMenu('artist:' + a, this.player.only(lib.songsBy(a)), null));
        }
      }
    }
    if (addons && packs.length) {
      y = this.librarySection(g, x0, y, x1, 'packs', tr('cuemymusic.section.packs'), packs.length, mx, my);
      if (!this.isCollapsed('packs')) {
        for (const p of packs) {
          y = this.libraryItem(g, x0, y, x1, LIB_ROW, p.art, p.name, null, view === 'PACK' && p.id === this.key, mx, my,
            () => this.open('PACK', p.id), () => this.listMenu('pack:' + p.id, this.player.only(lib.byPack(p.id)), null));
        }
      }
    }
    // Your playlists and, in Vanilla + FX, the game's track pools: playlists too, that you can change.
    let lists = playlists.map(p => ({ key: 'list:' + p.id, name: p.name, art: initialsArt(p.name), selected: view === 'LIST' && p.id === this.key,
      open: () => this.open('LIST', p.id), menu: () => this.listMenu('list:' + p.id, this.player.only(lib.tracksOf(p.songs)), p) }));
    for (const id of addons ? [] : this.sortedPools()) {
      const name = this.poolEdited(id) ? tr('cuemymusic.pool.edited_name', this.poolName(id)) : this.poolName(id);
      lists.push({ key: 'pool:' + id, name, art: this.poolArt(id), selected: view === 'POOL' && id === this.key,
        open: () => this.open('POOL', id), menu: () => this.poolListMenu(id) });
    }
    lists = this.librarySorted(lists, l => l.name, l => l.key);
    y = this.librarySection(g, x0, y, x1, 'playlists', tr('cuemymusic.section.playlists'), lists.length, mx, my);
    if (!this.isCollapsed('playlists') || !lists.length) {
      for (const l of lists) y = this.libraryItem(g, x0, y, x1, LIB_ROW, l.art, l.name, null, l.selected, mx, my, l.open, l.menu);
      y = this.libraryItem(g, x0, y, x1, LIB_ROW, NEW_PLAYLIST_ART, tr('cuemymusic.playlists.new'), null, false, mx, my,
        () => this.newPlaylist());
    }
    g.disableScissor();
    this.libraryScrollTop = this.libraryTop;
    this.libraryScrollBottom = this.libraryBottom;
    this.libraryScrollMax = Math.max(0, y - start + 4 - (this.libraryBottom - this.libraryTop));
    this.libraryScroll = clamp(this.libraryScroll, 0, this.libraryScrollMax);
    if (this.libraryScrollMax > 0) {
      // A thin bar showing how far the library is scrolled.
      const track = this.libraryBottom - this.libraryTop, bar = Math.max(12, Math.floor(track * track / (track + this.libraryScrollMax)));
      const by = this.libraryTop + Math.floor((track - bar) * this.libraryScroll / this.libraryScrollMax);
      g.fill(x1 - 3, by, x1 - 1, by + bar, 0xFF4D4D4D);
    }
    this.libraryTop = y0;
    this.libraryBottom = y1;
    this.libraryItem(g, x0, statsY, x1, big, STATS_ART, tr('cuemymusic.stats.title'), tr('cuemymusic.stats.subtitle'),
      view === 'STATS', mx, my, () => this.open('STATS', null));
    this.libraryItem(g, x0, settingsY, x1, big, SETTINGS_ART, tr('cuemymusic.settings'), tr('cuemymusic.settings.subtitle'),
      view === 'SETTINGS', mx, my, () => this.open('SETTINGS', null));
  }

  /** The mode: "vanilla" (the mod off), "fx" (the game's music with effects) or "addons". */
  mode() {
    return this.player.mode();
  }

  /** Switches mode, staying on Settings if that's where it was switched. */
  setMode(m) {
    if (m === this.mode()) return;
    if (m === 'vanilla') {
      this.cfg.vanilla = true;
    } else {
      this.cfg.vanilla = false;
      this.cfg.mode = m;
    }
    this.player.modeChanged();
    this.libraryScroll = 0;
    if (m !== 'vanilla' && this.view !== 'SETTINGS') this.open('HOME', null);
    this.showToast(tr('cuemymusic.mode.' + m + '.toast'));
  }

  /** The three modes as one switch, the one on in white, with a line saying what it means under it. Returns the y below. */
  drawModeSwitch(g, x0, y, x1, mx, my) {
    const w = x1 - x0, current = this.mode();
    // Full names where they fit, short ones in a narrow library.
    const full = MODES.every(m => this.font.width(tr('cuemymusic.mode.' + m)) + 6 <= w / 3);
    const labels = MODES.map(m => tr('cuemymusic.mode.' + m + (full ? '' : '.short')));
    y = this.segmented(g, x0, y, x1, mx, my, labels, MODES.indexOf(current), i => this.setMode(MODES[i]));
    const what = tr('cuemymusic.mode.' + current + '.desc');
    g.textWithWordWrap(what, x0, y, w, FAINT);
    return y + this.font.wrapHeight(what, w) + 4;
  }

  /** Choices side by side in one bar, the one picked in white. Returns the y below. */
  segmented(g, x0, y, x1, mx, my, labels, picked, pick) {
    const h = 14, n = labels.length, w = x1 - x0;
    g.fill(x0, y, x1, y + h, 0xFF2A2A2A);
    for (let i = 0; i < n; i++) {
      const sx0 = x0 + Math.floor(w * i / n), sx1 = x0 + Math.floor(w * (i + 1) / n);
      const on = i === picked, hover = mx >= sx0 && mx < sx1 && my >= y && my < y + h;
      if (on) g.fill(sx0, y, sx1, y + h, WHITE);
      else if (hover) g.fill(sx0, y, sx1, y + h, 0xFF3A3A3A);
      if (i > 0 && !on && i - 1 !== picked) g.fill(sx0, y + 3, sx0 + 1, y + h - 3, 0xFF4D4D4D);
      const label = this.clip(labels[i], sx1 - sx0 - 4);
      g.text(label, Math.floor((sx0 + sx1 - this.font.width(label)) / 2), y + 3, on ? BLACK : WHITE);
      this.hit(sx0, y, sx1, y + h, () => pick(i));
    }
    return y + h + 4;
  }

  /** Under the library's heading: the library's order. Returns the y below. */
  drawLibraryTools(g, x0, y, x1, mx, my) {
    y += 2;
    const sort = tr('cuemymusic.library.sort.' + this.cfg.librarySort) + ' ▼', sw = this.font.width(sort);
    const hover = mx >= x0 + 4 && mx < x0 + 8 + sw && my >= y - 1 && my < y + 10;
    g.text(this.clip(sort, x1 - x0 - 12), x0 + 6, y, hover ? WHITE : DIM);
    const menuY = y + 11;
    this.hit(x0 + 4, y - 1, x0 + 8 + sw, y + 10, () => this.showMenu({ x: x0 + 4, y: menuY, items: LIBRARY_SORTS.map(option =>
      item('none', (option === this.cfg.librarySort ? '✓ ' : '    ') + tr('cuemymusic.library.sort.' + option), () => {
        this.cfg.librarySort = option;
      })) }));
    return y + 12;
  }

  /** {@code items} in the library's order: as they come, by name, or most recently played first. */
  librarySorted(items, name, listKey) {
    switch (this.cfg.librarySort) {
      case 'alphabetical': return [...items].sort((a, b) => name(a).toLowerCase().localeCompare(name(b).toLowerCase()));
      // Never played keeps its place, after the ones that were.
      case 'recents': return [...items].sort((a, b) => (this.cfg.listsPlayed[listKey(b)] || 0) - (this.cfg.listsPlayed[listKey(a)] || 0));
      default: return items;
    }
  }

  /** A section heading that folds its rows away when clicked. Shows the count while folded. */
  librarySection(g, x0, y, x1, id, label, count, mx, my) {
    // An empty section stays open, so what would go in it (such as New playlist) shows.
    const folded = this.isCollapsed(id) && count > 0;
    const hover = this.libraryHover(x0, y, x1, y + LIB_SECTION, mx, my), color = hover ? WHITE : DIM, ay = y + 5;
    if (folded) {
      for (let i = 0; i < 3; i++) g.fill(x0 + 7 + i, ay + i - 1, x0 + 8 + i, ay + 4 - i, color);
    } else {
      for (let i = 0; i < 3; i++) g.fill(x0 + 6 + i, ay + i, x0 + 11 - i, ay + i + 1, color);
    }
    g.text(this.clip(folded ? label + '  ' + count : label, x1 - x0 - 20), x0 + 15, y + 3, color);
    this.libraryHit(x0, y, x1, y + LIB_SECTION, () => this.toggleCollapsed(id));
    return y + LIB_SECTION;
  }

  libraryHover(x0, y0, x1, y1, mx, my) {
    return mx >= x0 && mx < x1 && my >= Math.max(y0, this.libraryTop) && my < Math.min(y1, this.libraryBottom);
  }

  /** A click area in the library, cut to the part that's scrolled into view. */
  libraryHit(x0, y0, x1, y1, click) {
    const top = Math.max(y0, this.libraryTop), bottom = Math.min(y1, this.libraryBottom);
    if (bottom > top) this.hit(x0, top, x1, bottom, click);
  }

  /** The right-click menu for a list in the library: play it, queue it, start a radio from it, and rename or delete one of yours. */
  listMenu(listKey, tracks, playlist) {
    const items = [];
    if (tracks.length) {
      items.push(item('play', tr('cuemymusic.menu.play'), () => this.player.playAll(listKey, tracks)));
      items.push(item('plus', tr('cuemymusic.queue.add_all'), () => {
        this.player.enqueueAll(tracks);
        this.showToast(tr('cuemymusic.queue.added_all', tracks.length));
      }));
      if (this.radioHere()) {
        items.push(item('radio', tr('cuemymusic.menu.radio'), () => {
          this.player.startRadio(tracks[Math.floor(Math.random() * tracks.length)]);
          this.open('RADIO', null);
        }));
      }
    }
    if (playlist) {
      const id = playlist.id;
      items.push(DIVIDER);
      items.push(item('none', tr('cuemymusic.playlists.rename'), () => {
        this.open('LIST', id);
        this.startRename(id);
      }));
      items.push(item('delete', tr('cuemymusic.playlists.delete'), () => this.showMenu({ x: this.menuX, y: this.menuY, items: [
        item('delete', tr('cuemymusic.playlists.delete_named', playlist.name), () => {
          this.cfg.playlists = this.cfg.playlists.filter(p => p.id !== id);
          if (this.view === 'LIST' && id === this.key) this.open('PLAYLIST', null);
          this.showToast(tr('cuemymusic.playlists.deleted'));
        })] })));
    }
    return items;
  }

  /** A library row. With a {@code subtitle} and room for it, two lines; otherwise one compact line. */
  libraryItem(g, x0, y, x1, h, art, title, subtitle, selected, mx, my, click, menuItems = null) {
    if (y + h < this.libraryTop || y > this.libraryBottom) return y + h;
    const hover = this.libraryHover(x0, y, x1, y + h, mx, my);
    if (selected || hover) g.fill(x0 + 2, y, x1 - 2, y + h, selected ? SELECTED : ROW_HOVER);
    const artSize = Math.min(16, h - 2), ax = subtitle == null ? x0 + 15 : x0 + 5;
    this.art(g, art, ax, y + Math.floor((h - artSize) / 2), artSize);
    const tx = ax + artSize + 4, w = x1 - tx - 5;
    if (subtitle != null && h >= 21) {
      g.text(this.clip(title, w), tx, y + 3, selected ? GREEN : WHITE);
      g.text(this.clip(subtitle, w), tx, y + 12, DIM);
    } else {
      g.text(this.clip(title, w), tx, y + Math.floor((h - 8) / 2), selected ? GREEN : subtitle == null && !hover ? DIM : WHITE);
    }
    this.libraryHit(x0, y, x1, y + h, click);
    const top = Math.max(y, this.libraryTop), bottom = Math.min(y + h, this.libraryBottom);
    if (menuItems && bottom > top) this.nextLibraryMenus.push({ x0, y0: top, x1, y1: bottom, items: menuItems });
    return y + h;
  }

  /** Radio is only in Add-ons: in Vanilla + FX the game's music comes on its own. */
  radioHere() {
    return this.mode() === 'addons';
  }

  open(v, k) {
    if (v === 'RADIO' && !this.radioHere()) v = 'HOME';
    // Each mode's own pages: the game's lists in Vanilla + FX, the packs in Add-ons.
    const addons = this.mode() === 'addons';
    if ((addons && (v === 'PLAYLIST' || v === 'POOL')) || (!addons && (v === 'PACK' || v === 'PANEL'))) {
      v = 'HOME';
      k = null;
    }
    this.cfg.lastPage = k == null ? v : v + ':' + k;
    this.finishRename(true);
    this.clearSelection();
    if (v !== this.view || k !== this.key) {
      this.fields.clear();
      this.fieldSubmits.clear();
      this.unfocusField();
      this.pageFilterOpen = false;
      this.closeTransition();
    }
    this.view = v;
    this.key = k;
    this.scroll = 0;
  }

  // -------------------------------------------------------------- playlists

  newPlaylist() {
    const id = this.createPlaylist(tr('cuemymusic.playlists.default_name', this.cfg.playlists.length + 1));
    this.open('LIST', id);
    this.startRename(id);
  }

  startRename(id) {
    const p = this.playlist(id);
    if (!p) return;
    this.renamingId = id;
    const box = new EditBox(this.font, 120, 14, '');
    box.maxLength = 48;
    box.setValue(p.name);
    box.select = 0;
    box.focused = true;
    this.renameBox = box;
  }

  /** Ends renaming, keeping the typed name if {@code keep} and it isn't blank. */
  finishRename(keep) {
    if (!this.renameBox) return;
    const name = this.renameBox.value.trim();
    if (keep && name) this.replacePlaylist(this.renamingId, p => ({ ...p, name }));
    this.renameBox = null;
    this.renamingId = null;
  }

  /** Right-click menu for a song: playlists, liked, queue, then where to go, then removing. */
  openMenu(t, x, y) {
    const song = t.id, items = [];
    const exclude = this.view === 'LIST' ? this.key : null;
    items.push(item('plus', tr('cuemymusic.menu.add_to_playlist'), null, { exclude,
      add: p => this.showToast(this.addToPlaylist(p.id, song) ? tr('cuemymusic.playlists.added', p.name) : tr('cuemymusic.playlists.already', p.name)),
      addNew: () => {
        const id = this.createPlaylist(tr('cuemymusic.playlists.default_name', this.cfg.playlists.length + 1));
        this.addToPlaylist(id, song);
        this.open('LIST', id);
        this.startRename(id);
      } }));
    // Track pools are the game's music: Vanilla + FX only.
    if (this.mode() === 'fx') {
      items.push(item('pool', tr('cuemymusic.menu.add_to_pool'), () => this.showMenu({ x, y, items: this.poolItems(x, y, pools => this.addToPools([t], pools)) })));
    }
    const liked = this.isLiked(t);
    items.push(item(liked ? 'liked' : 'like', tr(liked ? 'cuemymusic.menu.unlike' : 'cuemymusic.menu.like'), () => this.toggleLiked(t)));
    items.push(item('queue', tr('cuemymusic.menu.queue'), () => {
      this.player.enqueue(t);
      this.showToast(tr('cuemymusic.queue.added'));
    }));
    if (this.player.allows(t)) {
      const disliked = this.isDisliked(t);
      items.push(item(disliked ? 'disliked' : 'dislike', tr(disliked ? 'cuemymusic.menu.undislike' : 'cuemymusic.menu.dislike'), () => this.toggleDisliked(t)));
    }
    items.push(DIVIDER);
    if (this.radioHere()) {
      items.push(item('radio', tr('cuemymusic.menu.song_radio'), () => {
        this.player.startRadio(t);
        this.open('RADIO', null);
      }));
    }
    if (t.artist && !(this.view === 'ARTIST' && t.artist === this.key)) {
      items.push(item('artist', tr('cuemymusic.menu.go_artist'), () => this.open('ARTIST', t.artist)));
    }
    const removing = [];
    if (this.view === 'LIST') {
      const listId = this.key;
      removing.push(item('remove', tr('cuemymusic.menu.remove'), () => {
        this.removeFromPlaylist(listId, song);
        this.showToast(tr('cuemymusic.playlists.removed'));
      }));
    }
    if (this.view === 'POOL') {
      const pool = this.key;
      removing.push(item('remove', tr('cuemymusic.menu.remove_from_pool'), () => this.removeFromPool([t], pool)));
    }
    const panel = this.view === 'PANEL' ? this.panels.find(p => p.id() === this.key) : this.panels.find(p => p.packId() === t.packId);
    if (panel) {
      const { label, run } = panel.deleteAction([t]);
      removing.push(item('delete', label, run));
    }
    if (removing.length) items.push(DIVIDER, ...removing);
    this.showMenu({ x, y, items });
  }

  showMenu(m) {
    this.menu = m;
    this.menuX = m.x;
    this.menuY = m.y;
    this.menuFilter = '';
    this.subOpen = false;
    this.subScroll = 0;
  }

  /** The menu, at the click, moved in so it stays on screen. */
  menuLayout() {
    let w = 0, h = MENU_PAD * 2;
    for (const i of this.menu.items) {
      if (i.label != null) w = Math.max(w, this.font.width(i.label) + (i.pick ? 18 : 0));
      h += i.label == null ? MENU_DIVIDER : MENU_ROW;
    }
    w += 36;
    const x = Math.max(2, Math.min(this.menu.x, this.width - w - 2)), y = Math.max(2, Math.min(this.menu.y, this.height - h - 2));
    const rows = [];
    let ry = y + MENU_PAD;
    for (const i of this.menu.items) {
      const rh = i.label == null ? MENU_DIVIDER : MENU_ROW;
      rows.push({ y0: ry, y1: ry + rh, item: i });
      ry += rh;
    }
    return layout(x, y, w, h, rows);
  }

  /** The playlists the menu's submenu offers, matching what's typed in its search box. */
  pickable(pick) {
    const q = normalize(this.menuFilter.trim());
    return this.cfg.playlists.filter(p => p.id !== pick.exclude && (!q || normalize(p.name).includes(q)));
  }

  /** The playlist submenu beside the menu row that opened it: a search box, New playlist, then the playlists. */
  subLayout(main) {
    const from = main.rows.filter(r => r.item.pick).at(-1);
    if (!from) return null;
    const pick = from.item.pick, lists = this.pickable(pick);
    this.subScroll = clamp(this.subScroll, 0, Math.max(0, lists.length - SUB_ROWS));
    const shown = Math.min(SUB_ROWS, lists.length - this.subScroll);
    const h = MENU_PAD * 2 + 20 + MENU_ROW + MENU_DIVIDER + Math.max(1, shown) * MENU_ROW;
    let x = main.x + main.w + 2;
    if (x + SUB_WIDTH > this.width - 2) x = main.x - SUB_WIDTH - 2;
    const y = Math.max(2, Math.min(from.y0 - MENU_PAD, this.height - h - 2));
    const rows = [];
    let ry = y + MENU_PAD;
    rows.push({ y0: ry, y1: ry + 20, item: FIELD });
    ry += 20;
    rows.push({ y0: ry, y1: ry + MENU_ROW, item: item('plus', tr('cuemymusic.menu.new_playlist'), pick.addNew) });
    ry += MENU_ROW;
    rows.push({ y0: ry, y1: ry + MENU_DIVIDER, item: DIVIDER });
    ry += MENU_DIVIDER;
    if (!lists.length) rows.push({ y0: ry, y1: ry + MENU_ROW, item: item('none', tr('cuemymusic.menu.no_playlists'), null) });
    for (let i = this.subScroll; i < this.subScroll + shown; i++) {
      const p = lists[i];
      rows.push({ y0: ry, y1: ry + MENU_ROW, item: item('none', p.name, () => pick.add(p)) });
      ry += MENU_ROW;
    }
    return layout(x, y, SUB_WIDTH, h, rows);
  }

  drawMenu(g, mx, my) {
    if (!this.menu) return;
    const main = this.menuLayout();
    let sub = this.subOpen ? this.subLayout(main) : null;
    // Hovering a row opens or closes the submenu; moving into the submenu keeps it open.
    const over = main.at(mx, my);
    if (over && over.item.label != null && (!sub || !sub.contains(mx, my))) {
      const open = !!over.item.pick;
      if (open !== this.subOpen) {
        this.subOpen = open;
        sub = open ? this.subLayout(main) : null;
      }
    }
    drawMenuBox(g, main);
    for (const r of main.rows) {
      const i = r.item;
      if (i.label == null) {
        g.fill(main.x + 6, r.y0 + 3, main.x + main.w - 6, r.y0 + 4, MENU_LINE);
        continue;
      }
      const hover = r === over || (i.pick && this.subOpen);
      if (hover) g.fill(main.x + 3, r.y0, main.x + main.w - 3, r.y1, MENU_HOVER);
      drawMenuIcon(g, i.icon, main.x + 9, r.y0 + 4, i.icon === 'liked' ? GREEN : WHITE, RED);
      g.text(i.label, main.x + 26, r.y0 + 5, i.icon === 'delete' ? RED : WHITE);
      if (i.pick) {
        const ax = main.x + main.w - 11, ay = r.y0 + 5;
        for (let k = 0; k < 4; k++) g.fill(ax + k, ay + k, ax + k + 1, ay + 8 - k, WHITE);
      }
    }
    if (!sub) return;
    drawMenuBox(g, sub);
    const subOver = sub.at(mx, my);
    for (const r of sub.rows) {
      const i = r.item;
      if (i === FIELD) {
        g.fill(sub.x + 4, r.y0 + 1, sub.x + sub.w - 4, r.y1 - 2, 0xFF3A3A3A);
        searchIcon(g, sub.x + 8, r.y0 + 5, DIM);
        const empty = !this.menuFilter;
        const text = empty ? tr('cuemymusic.menu.find_playlist') : this.clip(this.menuFilter, sub.w - 34);
        g.text(text, sub.x + 22, r.y0 + 6, empty ? FAINT : WHITE);
        if (Math.floor(Date.now() / 500) % 2 === 0) {
          const cx = sub.x + 22 + (empty ? 0 : this.font.width(text));
          g.fill(cx, r.y0 + 5, cx + 1, r.y0 + 14, WHITE);
        }
      } else if (i.label == null) {
        g.fill(sub.x + 6, r.y0 + 3, sub.x + sub.w - 6, r.y0 + 4, MENU_LINE);
      } else {
        if (r === subOver && i.action) g.fill(sub.x + 3, r.y0, sub.x + sub.w - 3, r.y1, MENU_HOVER);
        const tx = sub.x + (i.icon === 'none' ? 9 : 26);
        if (i.icon !== 'none') drawMenuIcon(g, i.icon, sub.x + 9, r.y0 + 4, WHITE, RED);
        g.text(this.clip(i.label, sub.x + sub.w - 8 - tx), tx, r.y0 + 5, i.action ? WHITE : FAINT);
      }
    }
    // Where the list is when there are more playlists than fit.
    const lists = this.pickable(main.rows.find(r => r.item.pick).item.pick);
    if (lists.length > SUB_ROWS) {
      const top = sub.rows[3].y0, bottom = sub.y + sub.h - MENU_PAD, barH = bottom - top;
      const thumbH = Math.max(6, Math.floor(barH * SUB_ROWS / lists.length));
      const thumbY = top + Math.floor((barH - thumbH) * this.subScroll / (lists.length - SUB_ROWS));
      g.fill(sub.x + sub.w - 4, thumbY, sub.x + sub.w - 2, thumbY + thumbH, 0xFF6A6A6A);
    }
  }

  /** A click while the menu is open: runs the row under it, or opens the playlist submenu. Anywhere else closes it. */
  menuClicked(mx, my) {
    const main = this.menuLayout(), sub = this.subOpen ? this.subLayout(main) : null;
    if (sub && sub.contains(mx, my)) {
      const r = sub.at(mx, my);
      if (r && r.item.action && r.item !== FIELD) {
        this.menu = null;
        r.item.action();
      }
      return;
    }
    const r = main.at(mx, my);
    if (!r) {
      this.menu = null;
      return;
    }
    if (r.item.pick) {
      this.subOpen = true;
    } else if (r.item.action) {
      this.menu = null;
      r.item.action();
    }
  }

  /** Typing while the menu is open searches its playlists. */
  menuTyped(c) {
    if (!this.menuLayout().rows.some(r => r.item.pick)) return false;
    this.subOpen = true;
    this.menuFilter += c;
    this.subScroll = 0;
    return true;
  }

  menuScrolled(mx, my, amount) {
    const sub = this.subOpen ? this.subLayout(this.menuLayout()) : null;
    if (!sub || !sub.contains(mx, my)) return false;
    this.subScroll -= Math.sign(amount);
    return true;
  }

  // ----------------------------------------------------------------- center

  drawCenter(g, mx, my) {
    const x0 = this.centerX0, y0 = this.centerY0, x1 = this.centerX1, y1 = this.centerY1, lib = this.lib, key = this.key;
    this.shownTracks = [];
    const hitsFrom = this.nextHits.length, dragsFrom = this.nextDrags.length, fieldsFrom = this.nextFieldHits.length;
    g.fill(x0, y0, x1, y1, PANEL);
    g.enableScissor(x0, y0, x1, y1);
    const contentTop = y0 - Math.floor(this.scroll);
    const pack = this.view === 'PACK' ? lib.pack(key) : null;
    if (this.view === 'PACK' && !pack) this.view = 'PLAYLIST';
    let contentBottom;
    switch (this.view) {
      case 'SETTINGS': contentBottom = this.drawSettings(g, x0, contentTop, x1, mx, my); break;
      case 'STATS': contentBottom = this.drawStats(g, x0, contentTop, x1, mx, my); break;
      case 'SEARCH': contentBottom = this.drawSearch(g, x0, contentTop, x1, mx, my); break;
      case 'RADIO': contentBottom = this.drawRadio(g, x0, contentTop, x1, mx, my); break;
      case 'HOME': contentBottom = this.drawHome(g, x0, contentTop, x1, mx, my); break;
      case 'PANEL': {
        const c = new Canvas(this, g, x0, contentTop, x1, mx, my);
        this.panels.find(p => p.id() === key).draw(c);
        contentBottom = c.y;
        break;
      }
      case 'ARTIST':
        contentBottom = this.drawTrackPage(g, x0, contentTop, x1, mx, my, 'artist:' + key, this.player.only(lib.songsBy(key)),
          this.artistArt(key), tr('cuemymusic.artist'), key, null, this.artistColor(key));
        break;
      case 'PACK':
        contentBottom = this.drawTrackPage(g, x0, contentTop, x1, mx, my, 'pack:' + key, this.player.only(lib.byPack(key)), pack.art,
          tr('cuemymusic.pack'), pack.name, pack.author, gradient(pack.name)[1]);
        break;
      case 'PLAYLIST':
        contentBottom = this.drawTrackPage(g, x0, contentTop, x1, mx, my, ALL, this.gameMusicShown(), PLAYLIST_ART,
          tr('cuemymusic.playlist'), tr('cuemymusic.playlist.title'), null, 0xFF1E3A2A);
        break;
      case 'LIKED':
        contentBottom = this.drawTrackPage(g, x0, contentTop, x1, mx, my, 'liked', this.liked(), LIKED_ART,
          tr('cuemymusic.playlist'), tr('cuemymusic.liked.title'), null, 0xFF3A2E6E);
        break;
      case 'DISLIKED':
        contentBottom = this.drawTrackPage(g, x0, contentTop, x1, mx, my, 'disliked', this.disliked(), DISLIKED_ART,
          tr('cuemymusic.playlist'), tr('cuemymusic.disliked.title'), tr('cuemymusic.disliked.byline'), 0xFF4A2424);
        break;
      case 'POOL':
        if (!key || !lib.pools.has(key)) {
          this.view = 'PLAYLIST';
          contentBottom = contentTop;
          break;
        }
        contentBottom = this.drawTrackPage(g, x0, contentTop, x1, mx, my, 'pool:' + key, this.poolTracks(key), this.poolArt(key),
          tr('cuemymusic.playlist'), this.poolName(key), tr(this.poolEdited(key) ? 'cuemymusic.pool.byline_edited' : 'cuemymusic.pool.byline'),
          0xFF24384A);
        break;
      case 'LIST': {
        const p = this.playlist(key);
        if (!p) {
          this.view = 'PLAYLIST';
          contentBottom = contentTop;
          break;
        }
        contentBottom = this.drawTrackPage(g, x0, contentTop, x1, mx, my, 'list:' + p.id, this.player.only(lib.tracksOf(p.songs)),
          initialsArt(p.name), tr('cuemymusic.playlist'), p.name, null, gradient(p.name)[1]);
        break;
      }
      default: contentBottom = contentTop;
    }
    g.disableScissor();
    this.clipToCenter(hitsFrom, dragsFrom, fieldsFrom);
    this.scrollMax = Math.max(0, contentBottom + Math.floor(this.scroll) - y1 + 8);
    this.scroll = clamp(this.scroll, 0, this.scrollMax);
  }

  /** Cuts what the centre panel just made clickable down to the part on screen, so nothing is clicked through the bottom bar. */
  clipToCenter(hitsFrom, dragsFrom, fieldsFrom) {
    const cx0 = this.centerX0, cy0 = this.centerY0, cx1 = this.centerX1, cy1 = this.centerY1;
    const cut = (list, from) => {
      for (let i = list.length - 1; i >= from; i--) {
        const h = list[i];
        const x0 = Math.max(h.x0, cx0), y0 = Math.max(h.y0, cy0), x1 = Math.min(h.x1, cx1), y1 = Math.min(h.y1, cy1);
        if (x0 >= x1 || y0 >= y1) list.splice(i, 1);
        else list[i] = { ...h, x0, y0, x1, y1 };
      }
    };
    cut(this.nextHits, hitsFrom);
    cut(this.nextFieldHits, fieldsFrom);
    for (let i = this.nextDrags.length - 1; i >= dragsFrom; i--) {
      const d = this.nextDrags[i];
      this.nextDrags[i] = { ...d, clipX0: Math.max(d.clipX0, cx0), clipY0: Math.max(d.clipY0, cy0), clipX1: Math.min(d.clipX1, cx1),
        clipY1: Math.min(d.clipY1, cy1) };
    }
  }

  /** A list of songs. {@code listKey} names it to the player, so its big button knows when it's the one playing. */
  drawTrackPage(g, x0, y, x1, mx, my, listKey, unsorted, art, kind, title, byline, color) {
    const total = unsorted.reduce((n, t) => n + (t.seconds || 0), 0);
    let summary = tr('cuemymusic.page.summary', unsorted.length, longDuration(total));
    if (byline != null) summary = tr('cuemymusic.page.byline', byline, summary);
    y = this.drawHeader(g, x0, y, x1, art, kind, title, summary, color);
    return this.drawTrackList(g, x0, y, x1, mx, my, listKey, unsorted);
  }

  /** What's typed in the page's search box, or "" when it's closed. */
  pageFilter() {
    const box = this.fields.get(PAGE_FILTER);
    return this.pageFilterOpen && box ? box.value : '';
  }

  /** The page's search: a magnifier, or once clicked, a box that filters the songs shown as you type. */
  drawPageFilter(g, left, right, y, mx, my) {
    if (!this.pageFilterOpen) {
      const ix = right - 10;
      const hover = mx >= ix - 3 && mx < right + 3 && my >= y && my < y + 18;
      searchIcon(g, ix, y + 5, hover ? WHITE : DIM);
      this.hit(ix - 3, y, right + 3, y + 18, () => {
        this.pageFilterOpen = true;
        this.focusPageFilter = true;
      });
      return;
    }
    // As wide as fits between the toolbar's other buttons, up to 140.
    const w = Math.min(140, right - left);
    if (w < 40) {
      this.pageFilterOpen = false;
      return;
    }
    const c = new Canvas(this, g, right - w - Canvas.PAD, y, right + Canvas.PAD, mx, my);
    c.textField(PAGE_FILTER, tr('cuemymusic.page.filter'), w, () => this.unfocusField());
    const box = this.fields.get(PAGE_FILTER);
    if (this.focusPageFilter) {
      this.focusPageFilter = false;
      this.focus(box);
    } else if (box !== this.focusedField && !box.value) {
      this.pageFilterOpen = false;
    }
  }

  /** A page's header: art, kind, big title, and a summary line. Returns the y below it. */
  drawHeader(g, x0, y, x1, art, kind, title, summary, color) {
    const headerH = 70;
    g.fillGradient(x0, y, x1, y + headerH, color, PANEL);
    this.art(g, art, x0 + 10, y + 12, 48);
    const tx = x0 + 66;
    g.text(kind, tx, y + 14, WHITE);
    if (this.view === 'LIST' && this.renameBox) {
      // Renaming: the name box sits where the title was.
      this.renameBox.x = tx;
      this.renameBox.y = y + 27;
      this.renameBox.w = Math.max(60, x1 - tx - 12);
    } else {
      this.bigText(g, this.clip(title, Math.floor((x1 - tx - 8) / 2)), tx, y + 26, 2, WHITE);
      if (this.view === 'LIST') {
        const id = this.key;
        this.hit(tx, Math.max(y + 24, this.centerY0), x1 - 8, y + 44, () => this.startRename(id));
      }
    }
    g.text(this.clip(summary, x1 - tx - 8), tx, y + 48, DIM);
    return y + headerH;
  }

  /** The big play button, add all to queue, the column headings, and the songs. Returns the y below them. */
  drawTrackList(g, x0, y, x1, mx, my, listKey, unsorted) {
    const player = this.player, font = this.font, filter = this.pageFilter(), filterTerms = terms(filter);
    const tracks = this.sorted(unsorted).filter(t => !filterTerms.length || matches(normalize(t.title + ' ' + t.artist + ' ' + t.album), filterTerms));
    let toolRight = x1 - 10;

    // Big play button for the whole list: pauses and resumes it once it's the one playing.
    const pb = 18, thisList = player.current && player.isPlayingList(listKey);
    roundButton(g, x0 + 10, y + 6, pb, GREEN);
    if (thisList && player.isPlaying()) pauseIcon(g, x0 + 10 + 6, y + 6 + 5, 8, BLACK);
    else playIcon(g, x0 + 10 + 7, y + 6 + 5, 8, BLACK);
    this.hit(x0 + 10, y + 6, x0 + 10 + pb, y + 6 + pb, () => {
      if (thisList) player.togglePause();
      else player.playAll(listKey, tracks);
    });
    // Shuffle, beside it: green while on.
    const sx = x0 + 10 + pb + 9, sy = y + 6 + 5;
    shuffleIcon(g, sx, sy, this.cfg.shuffle ? GREEN : this.hoverColor(sx - 3, y + 6, 15, pb));
    if (this.cfg.shuffle) g.fill(sx + 4, sy + 10, sx + 6, sy + 11, GREEN);
    this.hit(sx - 3, y + 6, sx + 12, y + 6 + pb, () => this.toggleShuffle());
    // A playlist's Rename and Delete are in its "..." menu, which leaves the toolbar room.
    if (this.view === 'LIST' && this.playlist(this.key)) {
      const p = this.playlist(this.key), dx = x1 - 22, ay = y + 6;
      const hover = mx >= dx && mx < dx + 14 && my >= ay && my < ay + 18;
      for (let i = 0; i < 3; i++) g.fill(dx + 2 + i * 4, ay + 8, dx + 4 + i * 4, ay + 10, hover ? WHITE : DIM);
      this.hit(dx, ay, dx + 14, ay + 18, () => this.showMenu({ x: dx, y: ay + 18,
        items: this.listMenu('list:' + p.id, player.only(this.lib.tracksOf(p.songs)), p) }));
      toolRight = dx - 8;
    }
    // A track pool you've changed can be put back as the game has it; that takes a second click.
    if (this.view === 'POOL' && this.poolEdited(this.key)) {
      const pool = this.key, armed = Date.now() < this.resetArmedUntil;
      const reset = tr(armed ? 'cuemymusic.pool.reset_confirm' : 'cuemymusic.pool.reset');
      const rx = x1 - 10 - font.width(reset), ay = y + 11;
      toolRight = rx - 14;
      const hover = mx >= rx - 2 && mx < x1 - 8 && my >= ay - 3 && my < ay + 11;
      g.text(reset, rx, ay, armed ? RED : hover ? WHITE : DIM);
      this.hit(rx - 2, ay - 3, x1 - 8, ay + 11, () => {
        if (Date.now() < this.resetArmedUntil) {
          this.resetArmedUntil = 0;
          this.resetPool(pool);
        } else {
          this.resetArmedUntil = Date.now() + 3000;
        }
      });
    }
    // Add the whole list to the queue, in the order shown.
    let toolLeft = x0 + 10 + pb + 21, mixMode = false;
    if (tracks.length) {
      const qx = toolLeft + 10, qy = y + 6;
      let label = tr('cuemymusic.queue.add_all'), qw = 13 + font.width(label);
      // Mix: shows the transitions in place of the list, once two songs next to each other can blend.
      let canMix = false;
      for (let i = 0; i + 1 < tracks.length && !canMix; i++) canMix = this.blends(tracks, i);
      mixMode = canMix && this.isMixPage(listKey);
      const mixLabel = tr('cuemymusic.mix.open'), mixW = canMix ? 14 + font.width(mixLabel) + 12 : 0;
      // Too narrow for the words: Add all to queue is just its +.
      if (qx + qw + mixW > toolRight - 20) {
        label = '';
        qw = 9;
      }
      const chipsRight = qx + qw + mixW;
      // Without room for an open search box, it takes these buttons' place until it closes.
      if (!this.pageFilterOpen || toolRight - chipsRight - 12 >= 100) {
        const qHover = mx >= qx - 2 && mx < qx + qw + 2 && my >= qy && my < qy + pb;
        plusIcon(g, qx, qy + 5, qHover ? WHITE : DIM);
        g.text(label, qx + 13, qy + 6, qHover ? WHITE : DIM);
        this.hit(qx - 2, qy, qx + qw + 2, qy + pb, () => {
          player.enqueueAll(tracks);
          this.showToast(tr('cuemymusic.queue.added_all', tracks.length));
        });
        toolLeft = qx + qw;
        if (canMix) {
          toolLeft += 14 + this.chip(g, qx + qw + 14, qy + 3, mixLabel, mixMode, mx, my, () => {
            this.setMixPage(listKey, !this.isMixPage(listKey));
            this.closeTransition();
            this.clearSelection();
            this.scroll = 0;
          });
        }
      }
    }
    // All game music narrows to one of the game's music pools.
    if (listKey === ALL) {
      const poolLabel = (this.gamePool == null ? tr('cuemymusic.pool.all') : this.poolName(this.gamePool)) + ' ▼';
      const px = toolLeft + 12, py = y + 9;
      toolLeft = px + this.chip(g, px, py, poolLabel, this.gamePool != null, mx, my, () => this.openPoolMenu(px, py + 15));
    }
    this.drawPageFilter(g, toolLeft + 12, toolRight, y + 6, mx, my);
    y += pb + 12;
    if (mixMode) {
      this.mixTracks = tracks;
      this.mixEdit = -1;
      for (let i = 0; this.mixFrom != null && i + 1 < tracks.length; i++) {
        if (tracks[i].id === this.mixFrom && tracks[i + 1].id === this.mixTo && this.blends(tracks, i)) {
          this.mixEdit = i;
          break;
        }
      }
      if (this.mixEdit < 0 && this.mixFrom != null) this.closeTransition();
      return this.mixEdit >= 0 ? this.drawTransitionEditor(g, x0, y, x1, mx, my, listKey) : this.drawMix(g, x0, y, x1, mx, my, listKey);
    }

    // Column headings; title, album and time sort.
    const showAlbum = x1 - x0 > 260, colTitle = x0 + 26, colAlbum = x0 + Math.floor((x1 - x0) * 55 / 100), colTime = x1 - 10;
    g.text('#', x0 + 10, y, DIM);
    this.heading(g, tr('cuemymusic.column.title'), colTitle, y, 'TITLE', mx, my);
    if (showAlbum) this.heading(g, tr('cuemymusic.column.album'), colAlbum, y, 'ALBUM', mx, my);
    const timeHover = mx >= colTime - 18 && mx < colTime + 2 && my >= y - 2 && my < y + 10;
    clockIcon(g, colTime - 7, y, this.sort === 'TIME' ? GREEN : timeHover ? WHITE : DIM);
    if (this.sort === 'TIME') arrow(g, colTime - 15, y + 1, this.ascending, GREEN);
    this.hit(colTime - 18, y - 2, colTime + 2, y + 10, () => this.cycleSort('TIME'));
    y += 11;
    g.fill(x0 + 8, y, x1 - 8, y + 1, 0xFF2A2A2A);
    y += 4;
    if (!tracks.length && filterTerms.length) {
      g.text(this.clip(tr('cuemymusic.page.filter_none', filter.trim()), x1 - x0 - 20), x0 + 10, y + 6, DIM);
      y += 20;
    }

    this.shownTracks = tracks;
    this.shownTop = y;
    const current = player.current, cy0 = this.centerY0, cy1 = this.centerY1;
    tracks.forEach((t, index) => {
      if (y + ROW > cy0 && y < cy1) {
        const hover = mx >= x0 && mx < x1 && my >= y && my < y + ROW && my >= cy0 && my < cy1;
        const isCurrent = t === current, isSelected = this.selected.has(t.id);
        if (isSelected) g.fill(x0 + 4, y, x1 - 4, y + ROW, hover ? 0xFF3A4A40 : 0xFF2C3A31);
        else if (hover) g.fill(x0 + 4, y, x1 - 4, y + ROW, ROW_HOVER);
        if (isCurrent && player.isPlaying()) equalizerIcon(g, x0 + 9, y + 6, GREEN);
        else g.text(String(index + 1), x0 + 10, y + 6, isCurrent ? GREEN : DIM);
        this.art(g, t.art, colTitle, y + 2, 16);
        const textX = colTitle + 20, titleW = (showAlbum ? colAlbum - 6 : colTime - 60) - textX;
        const disliked = this.isDisliked(t), liked = this.isLiked(t);
        g.text(this.clip(t.title, titleW), textX, y + 2, isCurrent ? GREEN : disliked ? FAINT : WHITE);
        g.text(this.clip(t.artist, titleW), textX, y + 11, DIM);
        // Stops short of the dislike, heart and + when they show.
        const albumEnd = hover || disliked ? colTime - 76 : liked ? colTime - 60 : colTime - 48;
        if (showAlbum) g.text(this.clip(t.album, albumEnd - colAlbum), colAlbum, y + 6, DIM);
        const len = t.seconds ? time(t.seconds) : '-:--';
        g.text(len, colTime - font.width(len), y + 6, DIM);
        const top = Math.max(y, cy0), bottom = Math.min(y + ROW, cy1);
        this.hit(x0, top, x1, bottom, () => this.rowClick(listKey, tracks, index));
        this.nextRowHits.push({ x0, y0: top, x1, y1: bottom, track: t, index });
        // Dislike: always shown once disliked, otherwise on hover, left of the heart. Only for songs the mode can pick.
        if ((hover || disliked) && player.allows(t)) {
          const dx = colTime - 72, dy = y + 5;
          const dislikeHover = hover && mx >= dx - 2 && mx < dx + 11 && my >= dy - 2 && my < dy + 11;
          dislikeIcon(g, dx, dy, disliked, disliked ? RED : dislikeHover ? WHITE : DIM);
          if (hover) this.hit(dx - 2, Math.max(dy - 2, cy0), dx + 11, Math.min(dy + 11, cy1), () => this.toggleDisliked(t));
        }
        // Like: always shown once liked, otherwise on hover, left of add to queue.
        if (hover || liked) {
          const hx = colTime - 56, hy = y + 6;
          const heartHover = hover && mx >= hx - 2 && mx < hx + 9 && my >= hy - 2 && my < hy + 8;
          heartIcon(g, hx, hy, liked, liked ? GREEN : heartHover ? WHITE : DIM);
          if (hover) this.hit(hx - 2, Math.max(hy - 2, cy0), hx + 9, Math.min(hy + 8, cy1), () => this.toggleLiked(t));
        }
        if (hover) {
          // Add to queue, just left of the length.
          const px = colTime - 40, py = y + 4;
          const plusHover = mx >= px - 2 && mx < px + 11 && my >= py - 2 && my < py + 11;
          plusIcon(g, px, py, plusHover ? WHITE : DIM);
          this.hit(px - 2, Math.max(py - 2, cy0), px + 11, Math.min(py + 11, cy1), () => {
            player.enqueue(t);
            this.showToast(tr('cuemymusic.queue.added'));
          });
        }
      }
      y += ROW;
    });
    if (!tracks.length && (this.view === 'LIKED' || this.view === 'LIST' || this.view === 'DISLIKED')) {
      // Songs the mode leaves out aren't gone: say where they are.
      const p = this.view === 'LIST' ? this.playlist(this.key) : null;
      const ids = this.view === 'LIKED' ? this.cfg.liked : this.view === 'DISLIKED' ? this.cfg.disliked : p ? p.songs : [];
      const hidden = this.lib.tracksOf(ids).length;
      const hint = hidden > 0
        ? tr('cuemymusic.page.other_mode', hidden, tr(this.mode() === 'addons' ? 'cuemymusic.mode.fx' : 'cuemymusic.mode.addons'))
        : tr(this.view === 'LIKED' ? 'cuemymusic.liked.empty' : this.view === 'DISLIKED' ? 'cuemymusic.disliked.empty' : 'cuemymusic.playlists.empty');
      g.textWithWordWrap(hint, x0 + 10, y + 4, x1 - x0 - 20, DIM);
      y += font.wrapHeight(hint, x1 - x0 - 20) + 4;
    }
    if (this.view === 'LIST' && !filter) y = this.drawPlaylistFinder(g, x0, y + 10, x1, mx, my, this.key);
    return y + 8;
  }

  /** Under a playlist's songs: search the library for more, with Add on each song found. */
  drawPlaylistFinder(g, x0, y, x1, mx, my, playlistId) {
    const c = new Canvas(this, g, x0, y, x1, mx, my);
    c.heading(tr('cuemymusic.playlists.find'));
    const typed = c.textField(PLAYLIST_FIND, tr('cuemymusic.search.hint'), Math.min(220, c.right() - c.left()), () => this.unfocusField());
    c.space(c.buttonHeight() + 8);
    if (!typed.trim()) return c.y;
    const list = this.playlist(playlistId);
    const found = this.searchSongs(typed).filter(t => !list || !list.songs.includes(t.id));
    if (!found.length) {
      c.text(tr('cuemymusic.search.none', typed.trim()), DIM);
      return c.y;
    }
    const left = c.left(), right = c.right();
    let ry = c.y;
    for (const t of found.slice(0, 20)) {
      const hover = mx >= x0 && mx < x1 && my >= ry && my < ry + ROW && my >= this.centerY0 && my < this.centerY1;
      if (hover) g.fill(x0 + 4, ry, x1 - 4, ry + ROW, ROW_HOVER);
      const add = tr('cuemymusic.playlists.add'), aw = this.font.width(add) + 12;
      this.queueRow(g, t, left, ry, right - left - aw - 8, WHITE, t.artist);
      this.chip(g, right - aw, ry + 3, add, false, mx, my, () => {
        if (this.addToPlaylist(playlistId, t.id)) this.showToast(tr('cuemymusic.playlists.added', this.playlist(playlistId).name));
      });
      ry += ROW;
    }
    return ry;
  }

  liked() {
    return this.player.only([...this.lib.tracksOf(this.cfg.liked)].reverse());
  }

  disliked() {
    return this.player.only(this.lib.tracksOf(this.cfg.disliked));
  }

  isDisliked(t) {
    return this.cfg.disliked.includes(t.id);
  }

  toggleDisliked(t) {
    this.showToast(tr(this.player.toggleDisliked(t) ? 'cuemymusic.disliked.added' : 'cuemymusic.disliked.removed'));
  }

  isLiked(t) {
    return this.cfg.liked.includes(t.id);
  }

  toggleLiked(t) {
    const was = this.isLiked(t), cfg = this.cfg;
    cfg.liked = was ? cfg.liked.filter(l => l !== t.id) : [...cfg.liked, t.id];
    if (!was) cfg.disliked = cfg.disliked.filter(d => d !== t.id);
    this.showToast(tr(was ? 'cuemymusic.liked.removed' : 'cuemymusic.liked.added'));
  }

  heading(g, label, x, y, column, mx, my) {
    const w = this.font.width(label);
    const hover = mx >= x - 2 && mx < x + w + 10 && my >= y - 2 && my < y + 10, active = this.sort === column;
    g.text(label, x, y, active ? GREEN : hover ? WHITE : DIM);
    if (active) arrow(g, x + w + 3, y + 1, this.ascending, GREEN);
    this.hit(x - 2, y - 2, x + w + 10, y + 10, () => this.cycleSort(column));
  }

  cycleSort(column) {
    if (this.sort !== column) {
      this.sort = column;
      this.ascending = true;
    } else if (this.ascending) {
      this.ascending = false;
    } else {
      this.sort = 'NONE';
    }
  }

  sorted(tracks) {
    const by = { TITLE: t => t.title.toLowerCase(), ALBUM: t => t.album.toLowerCase(), TIME: t => t.seconds || Infinity }[this.sort];
    if (!by) return tracks;
    const dir = this.ascending ? 1 : -1;
    return [...tracks].sort((a, b) => (by(a) < by(b) ? -dir : by(a) > by(b) ? dir : 0));
  }

  // ---------------------------------------------------------------- toasts

  showToast(text) {
    this.toast = text;
    this.toastUntil = Date.now() + TOAST_MILLIS;
  }

  drawToast(g) {
    if (!this.toast || Date.now() > this.toastUntil) return;
    const w = this.font.width(this.toast) + 16;
    const x = Math.floor((this.centerX0 + this.centerX1 - w) / 2), y = this.centerY1 - (this.selected.size ? 42 : 22);
    g.fill(x, y, x + w, y + 16, WHITE);
    g.text(this.toast, x + 8, y + 4, BLACK);
  }

  toggleShuffle() {
    const on = !this.cfg.shuffle;
    this.player.setShuffle(on);
    this.showToast(tr(on ? 'cuemymusic.shuffle.on' : 'cuemymusic.shuffle.off'));
  }

  // -------------------------------------------------------------- selection

  clearSelection() {
    this.selected.clear();
    this.anchor = this.focusRow = -1;
    this.selectDragging = false;
  }

  /** The selected songs, in the order shown. */
  selectedTracks() {
    return this.shownTracks.filter(t => this.selected.has(t.id));
  }

  /** Selects the rows from {@code a} to {@code b}, either way round, and nothing else. */
  selectRange(a, b) {
    this.selected.clear();
    if (!this.shownTracks.length) return;
    const last = this.shownTracks.length - 1, lo = clamp(Math.min(a, b), 0, last), hi = clamp(Math.max(a, b), 0, last);
    for (let i = lo; i <= hi; i++) this.selected.add(this.shownTracks[i].id);
  }

  /** The row at screen height {@code y}, held to the list's ends, or -1 with no list. */
  rowAt(y) {
    if (!this.shownTracks.length) return -1;
    const at = clamp(y, this.centerY0, this.centerY1 - 1);
    return clamp(Math.floor((at - this.shownTop) / ROW), 0, this.shownTracks.length - 1);
  }

  /** Songs can be dragged into a new order on a playlist shown in its own order, without a search. */
  canReorder() {
    return this.view === 'LIST' && this.sort === 'NONE' && !this.pageFilter().trim() && this.shownTracks.length > 0;
  }

  /** Where a dragged song would go: the gap before row n, from 0 to the number of rows. */
  dropGap(y) {
    const at = clamp(y, this.centerY0, this.centerY1 - 1);
    return clamp(Math.round((at - this.shownTop) / ROW), 0, this.shownTracks.length);
  }

  /** Drops the dragged song, or the selection if it was in it, into the gap at {@code y}. */
  dropRows(r, y) {
    if (this.view !== 'LIST') return;
    const moving = this.selected.has(r.track.id) && this.selected.size > 1 ? [...this.selected] : [r.track.id];
    const gap = this.dropGap(y), before = gap < this.shownTracks.length ? this.shownTracks[gap].id : null;
    // Dropped just under itself: no change.
    if (moving.length === 1 && gap === r.index + 1) return;
    this.replacePlaylist(this.key, p => ({ ...p, songs: moved(p.songs, moving, before) }));
  }

  /** While a song is dragged: a green line where it would go, and its title by the pointer. */
  drawReorder(g, mx, my) {
    if (!this.pressed || !this.reordering) return;
    const gy = this.shownTop + this.dropGap(my) * ROW;
    if (gy >= this.centerY0 - 1 && gy <= this.centerY1) {
      g.fill(this.centerX0 + 8, gy - 1, this.centerX1 - 8, gy + 1, GREEN);
      g.fill(this.centerX0 + 6, gy - 3, this.centerX0 + 10, gy + 3, GREEN);
    }
    const n = this.selected.has(this.pressed.track.id) && this.selected.size > 1 ? this.selected.size : 1;
    const label = n > 1 ? tr('cuemymusic.page.moving', n) : this.pressed.track.title, w = this.font.width(label) + 10;
    g.fill(mx + 10, my - 4, mx + 10 + w, my + 10, 0xEE282828);
    g.text(label, mx + 15, my, WHITE);
  }

  /** Scrolls just enough to show row {@code i}. */
  revealRow(i) {
    const top = this.shownTop + i * ROW;
    if (top < this.centerY0) this.scroll -= this.centerY0 - top;
    else if (top + ROW > this.centerY1) this.scroll += top + ROW - this.centerY1;
    this.scroll = clamp(this.scroll, 0, this.scrollMax);
  }

  /** Shift+click selects from the last row clicked, dragging on carries it along; Cmd/Ctrl+click adds or removes one row. */
  rowClicked(e) {
    for (const r of this.rowHits) {
      if (!inside(r, e.x, e.y)) continue;
      if (!e.shift && !e.ctrl) {
        if (!this.canReorder()) {
          this.clearSelection();
          return false;
        }
        // Wait to see if it's a click (play, like...) or a drag to move the song.
        this.pressed = r;
        this.pressX = e.x;
        this.pressY = e.y;
        this.reordering = false;
        return true;
      }
      if (e.ctrl && !e.shift) {
        if (!this.selected.delete(r.track.id)) this.selected.add(r.track.id);
        this.anchor = this.focusRow = r.index;
      } else {
        if (this.anchor < 0) this.anchor = r.index;
        this.focusRow = r.index;
        this.selectRange(this.anchor, this.focusRow);
        this.selectDragging = true;
      }
      return true;
    }
    return false;
  }

  /** The player keys, with Cmd (Ctrl elsewhere): left and right for previous and next, up and down for volume, S shuffle, R repeat. */
  playerKey(e) {
    if (!e.ctrl || e.shift || e.alt) return false;
    switch (e.key) {
      case 'ArrowLeft': this.player.previous(); break;
      case 'ArrowRight': this.player.next(); break;
      case 'ArrowUp':
      case 'ArrowDown': {
        const step = e.key === 'ArrowUp' ? 0.1 : -0.1;
        this.cfg.volume = clamp(Math.round((this.cfg.volume + step) * 10) / 10, 0, 1);
        this.showToast(tr('cuemymusic.volume', Math.round(this.cfg.volume * 100)));
        break;
      }
      case 's': this.toggleShuffle(); break;
      case 'r': this.cycleRepeat(); break;
      default: return false;
    }
    return true;
  }

  /** A click selects the song, and a double click plays it from there. */
  rowClick(listKey, tracks, index) {
    const id = tracks[index].id, now = Date.now();
    this.rowListKey = listKey;
    this.rowList = tracks;
    if (id === this.lastRowClick && now - this.lastRowClickAt < DOUBLE_CLICK_MILLIS) {
      this.lastRowClick = null;
      this.clearSelection();
      this.player.play(listKey, tracks, index);
      return;
    }
    this.lastRowClick = id;
    this.lastRowClickAt = now;
    this.clearSelection();
    this.selected.add(id);
    this.anchor = this.focusRow = index;
  }

  /** Shift+up/down grows or shrinks the selection, Cmd/Ctrl+A selects all, Esc clears, Delete removes, Enter plays. */
  selectionKey(e) {
    if (!this.shownTracks.length) return false;
    const key = e.key, last = this.shownTracks.length - 1;
    if (e.ctrl && key === 'a') {
      this.anchor = 0;
      this.focusRow = last;
      this.selectRange(0, last);
      return true;
    }
    if (e.shift && (key === 'ArrowUp' || key === 'ArrowDown')) {
      if (this.focusRow < 0) {
        const playing = this.shownTracks.indexOf(this.player.current);
        this.focusRow = this.anchor = playing >= 0 ? playing : 0;
      } else {
        this.focusRow = clamp(this.focusRow + (key === 'ArrowUp' ? -1 : 1), 0, last);
        if (this.anchor < 0) this.anchor = this.focusRow;
      }
      this.selectRange(this.anchor, this.focusRow);
      this.revealRow(this.focusRow);
      return true;
    }
    if (!this.selected.size) return false;
    if (key === 'Escape') {
      this.clearSelection();
      return true;
    }
    if (key === 'Enter' && this.rowListKey != null) {
      // The first selected song, from the list it's in.
      const i = this.rowList.findIndex(t => this.selected.has(t.id));
      if (i >= 0) {
        this.player.play(this.rowListKey, this.rowList, i);
        this.clearSelection();
        return true;
      }
    }
    if (key === 'Delete' || key === 'Backspace') {
      const del = this.deleteItem(this.selectedTracks());
      if (del) del.action();
      return true;
    }
    return false;
  }

  /** What Delete does on this page: take the songs out of the playlist, the pool, Liked Songs or Disliked Songs. */
  deleteItem(tracks) {
    if (!tracks.length) return null;
    const n = tracks.length, done = () => this.clearSelection();
    switch (this.view) {
      case 'LIST': {
        const listId = this.key;
        return item('remove', tr('cuemymusic.bulk.remove', n), () => {
          for (const t of tracks) this.removeFromPlaylist(listId, t.id);
          this.showToast(tr('cuemymusic.bulk.removed', n));
          done();
        });
      }
      case 'POOL': {
        const pool = this.key;
        return item('remove', tr('cuemymusic.bulk.remove_from_pool', n), () => {
          this.removeFromPool(tracks, pool);
          done();
        });
      }
      case 'LIKED':
        return item('liked', tr('cuemymusic.bulk.unlike', n), () => {
          this.cfg.liked = this.cfg.liked.filter(id => !tracks.some(t => t.id === id));
          this.showToast(tr('cuemymusic.bulk.unliked', n));
          done();
        });
      case 'DISLIKED':
        return item('disliked', tr('cuemymusic.bulk.undislike', n), () => {
          for (const t of tracks) if (this.isDisliked(t)) this.player.toggleDisliked(t);
          this.showToast(tr('cuemymusic.bulk.undisliked', n));
          done();
        });
      case 'PANEL': {
        const a = this.panels.find(p => p.id() === this.key).deleteAction(tracks);
        return item('delete', a.label, () => {
          a.run();
          done();
        });
      }
      default:
        return null;
    }
  }

  /** The right-click menu for several selected songs. */
  openBulkMenu(tracks, x, y) {
    const n = tracks.length, items = [];
    items.push(item('plus', tr('cuemymusic.bulk.add_to_playlist', n), null, { exclude: this.view === 'LIST' ? this.key : null,
      add: p => {
        let added = 0;
        for (const t of tracks) if (this.addToPlaylist(p.id, t.id)) added++;
        this.showToast(tr('cuemymusic.bulk.added', added, p.name));
      },
      addNew: () => {
        const listId = this.createPlaylist(tr('cuemymusic.playlists.default_name', this.cfg.playlists.length + 1));
        for (const t of tracks) this.addToPlaylist(listId, t.id);
        this.open('LIST', listId);
        this.startRename(listId);
      } }));
    if (this.mode() === 'fx') {
      items.push(item('pool', tr('cuemymusic.bulk.add_to_pool', n), () => this.showMenu({ x, y, items: this.poolItems(x, y, pools => this.addToPools(tracks, pools)) })));
    }
    const allLiked = tracks.every(t => this.isLiked(t));
    if (this.view !== 'LIKED' || !allLiked) {
      items.push(item(allLiked ? 'liked' : 'like', tr(allLiked ? 'cuemymusic.bulk.unlike' : 'cuemymusic.bulk.like', n), () => {
        const ids = tracks.map(t => t.id);
        this.cfg.liked = allLiked ? this.cfg.liked.filter(id => !ids.includes(id)) : [...this.cfg.liked, ...ids.filter(id => !this.cfg.liked.includes(id))];
        if (!allLiked) this.cfg.disliked = this.cfg.disliked.filter(id => !ids.includes(id));
        this.showToast(tr(allLiked ? 'cuemymusic.bulk.unliked' : 'cuemymusic.bulk.liked', n));
      }));
    }
    items.push(item('queue', tr('cuemymusic.bulk.queue', n), () => {
      this.player.enqueueAll(tracks);
      this.showToast(tr('cuemymusic.queue.added_all', n));
    }));
    const game = tracks.filter(t => this.player.allows(t));
    const allDisliked = game.length > 0 && game.every(t => this.isDisliked(t));
    if (game.length && this.view !== 'DISLIKED') {
      items.push(item(allDisliked ? 'disliked' : 'dislike', tr(allDisliked ? 'cuemymusic.bulk.undislike' : 'cuemymusic.bulk.dislike', game.length), () => {
        for (const t of game) if (this.isDisliked(t) === allDisliked) this.player.toggleDisliked(t);
        this.showToast(tr(allDisliked ? 'cuemymusic.bulk.undisliked' : 'cuemymusic.bulk.disliked', game.length));
      }));
    }
    const del = this.deleteItem(tracks);
    if (del && del.icon !== 'liked' && del.icon !== 'disliked') items.push(DIVIDER, del);
    this.showMenu({ x, y, items });
  }

  /** While songs are selected: how many. */
  drawSelectionBar(g) {
    // One clicked song is just highlighted.
    if (this.selected.size < 2 || !this.shownTracks.length) return;
    const text = tr('cuemymusic.selection', this.selected.size), w = this.font.width(text) + 16;
    const x = Math.floor((this.centerX0 + this.centerX1 - w) / 2), y = this.centerY1 - 22;
    g.fill(x, y, x + w, y + 16, 0xFF2C3A31);
    g.fill(x, y, x + 2, y + 16, GREEN);
    g.text(text, x + 9, y + 4, WHITE);
  }

  // ------------------------------------------------------------ text fields

  focus(box) {
    if (this.focusedField === box) return;
    this.unfocusField();
    this.focusedField = box;
    box.focused = true;
  }

  unfocusField() {
    if (!this.focusedField) return;
    this.focusedField.focused = false;
    this.focusedField = null;
  }

  submitField() {
    for (const [k, box] of this.fields) {
      if (box === this.focusedField) {
        const submit = this.fieldSubmits.get(k);
        if (submit) submit(box.value);
        return;
      }
    }
  }

  // ------------------------------------------------------------------ input

  keyPressed(e) {
    if (this.cfg.vanilla) return false;
    if (this.renameBox) {
      if (e.key === 'Enter') this.finishRename(true);
      else if (e.key === 'Escape') this.finishRename(false);
      else return this.renameBox.keyPressed(e);
      return true;
    }
    if (this.focusedField) {
      if (e.key === 'Enter') this.submitField();
      else if (e.key === 'Escape') this.unfocusField();
      else return this.focusedField.keyPressed(e);
      return true;
    }
    if (this.menu && e.key === 'Escape') {
      this.menu = null;
      return true;
    }
    if (!this.menu && this.mixFrom != null && e.key === 'Escape') {
      this.closeTransition();
      return true;
    }
    if (this.menu && e.key === 'Backspace' && this.menuFilter) {
      this.menuFilter = [...this.menuFilter].slice(0, -1).join('');
      this.subScroll = 0;
      return true;
    }
    // While a menu is open, keys type into its playlist search rather than playing, pausing or seeking.
    if (this.menu) return true;
    // Cmd/Ctrl+Shift+L searches everything; Cmd/Ctrl+F searches the page open, if it's a list of songs.
    if (e.key.toLowerCase() === 'l' && e.ctrl && e.shift) {
      if (this.view === 'SEARCH') this.focusSearch = true;
      else this.openSearch();
      return true;
    }
    if (e.key === 'f' && e.ctrl) {
      if (this.view === 'SEARCH') {
        this.focusSearch = true;
      } else if (this.hasSongList()) {
        this.pageFilterOpen = true;
        this.focusPageFilter = true;
      } else {
        this.openSearch();
      }
      return true;
    }
    if (this.playerKey(e)) return true;
    if (this.selectionKey(e)) return true;
    if (e.key === ' ') {
      this.player.togglePause();
      return true;
    }
    return false;
  }

  charTyped(c) {
    if (this.renameBox) return this.renameBox.charTyped(c);
    if (this.focusedField) return this.focusedField.charTyped(c);
    if (this.menu && this.menuTyped(c)) return true;
    return false;
  }

  mouseClicked(e) {
    const x = e.x, y = e.y;
    if (this.menu) {
      if (e.button === 0) this.menuClicked(x, y);
      else this.menu = null;
      return true;
    }
    if (this.renameBox) {
      if (this.renameBox.isMouseOver(x, y)) {
        this.renameBox.mouseClicked(x);
        return true;
      }
      this.finishRename(true);
    }
    for (const f of this.fieldHits) {
      const box = this.fields.get(f.key);
      if (box && inside(f, x, y) && e.button === 0) {
        this.focus(box);
        box.mouseClicked(x);
        return true;
      }
    }
    this.unfocusField();
    if (e.button === 2) {
      for (const m of this.libraryMenus) {
        if (inside(m, x, y)) {
          const items = m.items();
          if (items.length) this.showMenu({ x, y, items });
          return true;
        }
      }
      for (const r of this.rowHits) {
        if (inside(r, x, y)) {
          if (this.selected.size > 1 && this.selected.has(r.track.id)) {
            this.openBulkMenu(this.selectedTracks(), x, y);
          } else {
            this.clearSelection();
            this.openMenu(r.track, x, y);
          }
          return true;
        }
      }
    }
    if (e.button === 0) {
      if (this.queueClicked(x, y, e.double)) return true;
      if (this.nextFromClicked(x, y)) return true;
      if (this.rowClicked(e)) return true;
      for (const d of this.drags) {
        if (dragContains(d, x, y)) {
          this.dragging = d;
          d.onFraction(dragFraction(d, x, y));
          return true;
        }
      }
      for (let i = this.hits.length - 1; i >= 0; i--) {
        if (inside(this.hits[i], x, y)) {
          this.hits[i].click();
          return true;
        }
      }
      // The transition editor's songs drag sideways.
      if (this.mixLaneScroll && x >= this.mixLaneX0 && x < this.mixLaneX1 && y >= this.mixLaneY0 && y < this.mixLaneY1) {
        this.laneDrag = y < this.mixLaneSplit ? 1 : 2;
        this.laneDragX = x;
        this.laneDragBase = this.laneDrag === 1 ? this.mixLaneValueA : this.mixLaneValueB;
        return true;
      }
    }
    return false;
  }

  /** Queue rows: × removes, a double click plays, and pressing anywhere else starts a drag to reorder. */
  queueClicked(x, y, double) {
    if (!this.queueRows || x < this.queueX0 || x >= this.queueX1 || y < this.queueTop || y >= this.queueTop + this.queueRows * QROW) return false;
    const i = Math.round(this.queueScroll) + Math.floor((y - this.queueTop) / QROW);
    if (x >= this.queueX1 - 17) {
      this.player.unqueue(i);
    } else if (double) {
      this.player.playQueued(i);
    } else {
      this.queueDrag = i;
      this.queueDragY = y;
    }
    return true;
  }

  mouseDragged(e) {
    if (this.pressed) {
      if (!this.reordering && Math.abs(e.y - this.pressY) > 4) this.reordering = true;
      return true;
    }
    if (this.selectDragging) {
      const row = this.rowAt(e.y);
      if (row >= 0) {
        this.focusRow = row;
        this.selectRange(this.anchor, row);
      }
      return true;
    }
    if (this.queueDrag >= 0) {
      this.queueDragY = e.y;
      return true;
    }
    if (this.nextFromDrag >= 0) {
      this.nextFromDragY = e.y;
      return true;
    }
    if (this.dragging) {
      this.dragging.onFraction(dragFraction(this.dragging, e.x, e.y));
      return true;
    }
    if (this.laneDrag) {
      // The song follows the mouse: the first one's start moves later as it's dragged left, the next one comes in later.
      const movedBy = (e.x - this.laneDragX) * this.mixLaneSpp;
      if (this.laneDrag === 1 && this.mixLaneSetA) this.mixLaneSetA(this.laneDragBase + movedBy);
      if (this.laneDrag === 2 && this.mixLaneSetB) this.mixLaneSetB(this.laneDragBase - movedBy);
      return true;
    }
    return false;
  }

  mouseReleased(e) {
    if (this.pressed) {
      const r = this.pressed;
      this.pressed = null;
      if (this.reordering) {
        this.reordering = false;
        this.dropRows(r, e.y);
      } else {
        // Just a click: what it would have done straight away.
        this.clearSelection();
        for (let i = this.hits.length - 1; i >= 0; i--) {
          if (inside(this.hits[i], this.pressX, this.pressY)) {
            this.hits[i].click();
            break;
          }
        }
      }
      return true;
    }
    if (this.selectDragging) {
      this.selectDragging = false;
      return true;
    }
    if (this.queueDrag >= 0) {
      const from = this.queueDrag, slot = this.dropSlot(this.queueDragY);
      this.queueDrag = -1;
      this.player.moveQueued(from, slot > from ? slot - 1 : slot);
      return true;
    }
    if (this.nextFromDrag >= 0) {
      const from = this.nextFromDrag;
      this.nextFromDrag = -1;
      if (Math.abs(e.y - this.nextFromPressY) <= 4) {
        this.player.playUpNext(from);
      } else {
        const slot = this.nextFromSlot(e.y);
        this.player.moveUpNext(from, slot > from ? slot - 1 : slot);
      }
      return true;
    }
    if (this.dragging) {
      const d = this.dragging;
      this.dragging = null;
      d.onRelease();
      return true;
    }
    if (this.laneDrag) {
      this.laneDrag = 0;
      return true;
    }
    return false;
  }

  mouseScrolled(x, y, horizontal, vertical, shift) {
    if (this.menu && this.menuScrolled(x, y, vertical)) return true;
    if (this.queueFit > 0 && x >= this.queueX0 && x < this.queueX1 && y >= this.queueTop && y < this.queueTop + this.queueFit * QROW) {
      this.queueScroll -= vertical;
      return true;
    }
    if (x >= this.libraryX0 && x < this.libraryX1 && y >= this.libraryScrollTop && y < this.libraryScrollBottom && this.libraryScrollMax > 0) {
      this.libraryScroll = clamp(this.libraryScroll - vertical * 24, 0, this.libraryScrollMax);
      return true;
    }
    const sideways = Math.abs(horizontal) > Math.abs(vertical) || shift;
    if (this.presetScrollMax > 0 && this.mixFrom != null && x >= this.presetX0 && x < this.presetX1 && y >= this.presetY0 && y < this.presetY1) {
      this.presetScroll = clamp(this.presetScroll - (horizontal || vertical) * 24, 0, this.presetScrollMax);
      return true;
    }
    if (this.mixLaneScroll && sideways && x >= this.mixLaneX0 && x < this.mixLaneX1 && y >= this.mixLaneY0 && y < this.mixLaneY1) {
      // Whole beats only: what's left over waits for more scrolling.
      this.mixScrollRest += horizontal || vertical;
      const steps = Math.trunc(this.mixScrollRest);
      this.mixScrollRest -= steps;
      if (steps) (y < this.mixLaneSplit ? this.mixLaneScroll : this.mixLaneScrollNext)(steps);
      return true;
    }
    if (x >= this.centerX0 && x < this.centerX1 && y >= this.centerY0 && y < this.centerY1) {
      this.scroll = clamp(this.scroll - vertical * 24, 0, this.scrollMax);
      return true;
    }
    return false;
  }

  /** Whether the pointer is over something that takes a click, for the cursor. */
  clickable(x, y) {
    return !!this.menu || this.hits.some(h => inside(h, x, y)) || this.drags.some(d => dragContains(d, x, y))
      || this.fieldHits.some(f => inside(f, x, y)) || (this.queueRows > 0 && x >= this.queueX0 && x < this.queueX1 && y >= this.queueTop
        && y < this.queueTop + this.queueRows * QROW);
  }

  // ---------------------------------------------------------------- drawing

  art(g, art, x, y, size) {
    if (art.tex) {
      g.blit(art.tex, x, y, size);
    } else if (art.sprite) {
      g.fillGradient(x, y, x + size, y + size, art.top, art.bottom);
      const s = Math.max(5, Math.floor(size * 9 / 16));
      g.blit(art.sprite, x + Math.floor((size - s) / 2), y + Math.floor((size - s) / 2), s);
    } else {
      // Initials, or a stamp: initials over a darkened block.
      if (art.block) {
        g.blit(art.block, x, y, size);
        g.fill(x, y, x + size, y + size, 0x66000000);
      } else {
        g.fillGradient(x, y, x + size, y + size, art.top, art.bottom);
      }
      const w = this.font.width(art.text), scale = Math.min(size * 0.7 / Math.max(1, w), size * 0.45 / 8);
      g.push();
      g.translate(x + size / 2, y + size / 2);
      g.scale(scale, scale);
      g.text(art.text, -Math.floor(w / 2), -4, WHITE, !!art.block);
      g.pop();
    }
  }

  bigText(g, s, x, y, scale, color) {
    g.push();
    g.translate(x, y);
    g.scale(scale, scale);
    g.text(s, 0, 0, color);
    g.pop();
  }

  /** Text that fits is drawn as is; longer text waits, scrolls to its end, waits, and scrolls back. */
  marquee(g, s, x, y, w, color, scale) {
    const textW = this.font.width(s) * scale;
    if (textW <= w) {
      this.bigText(g, s, x, y, scale, color);
      return;
    }
    const travel = textW - w, pauseMs = 2000, speed = 25 * scale / 1000, move = travel / speed;
    const t = Date.now() % Math.floor(2 * (pauseMs + move));
    const out = t < pauseMs ? 0 : t < pauseMs + move ? (t - pauseMs) / move : t < 2 * pauseMs + move ? 1 : 1 - (t - 2 * pauseMs - move) / move;
    g.enableScissor(x, y - 1, x + w, y + Math.ceil(9 * scale) + 1);
    g.push();
    g.translate(x - out * travel, y);
    g.scale(scale, scale);
    g.text(s, 0, 0, color);
    g.pop();
    g.disableScissor();
  }

  artistColor(artist) {
    const palette = [0xFF2B4A2B, 0xFF4A1F2A, 0xFF4A3A1F, 0xFF1F334A, 0xFF2A2A4A, 0xFF3A4A1F, 0xFF333333];
    const i = this.lib.artistOrder.indexOf(artist);
    return palette[i < 0 ? palette.length - 1 : i];
  }
}

function layout(x, y, w, h, rows) {
  return {
    x, y, w, h, rows,
    at(mx, my) {
      if (mx < x || mx >= x + w) return null;
      return rows.find(r => my >= r.y0 && my < r.y1) || null;
    },
    contains: (mx, my) => mx >= x && mx < x + w && my >= y && my < y + h,
  };
}

function drawMenuBox(g, l) {
  // Rounded by knocking the corners off, with a soft shadow.
  g.fill(l.x + 2, l.y + 3, l.x + l.w + 3, l.y + l.h + 3, 0x66000000);
  g.fill(l.x + 1, l.y, l.x + l.w - 1, l.y + l.h, MENU_BG);
  g.fill(l.x, l.y + 1, l.x + l.w, l.y + l.h - 1, MENU_BG);
}

/** Draws a page with the player's own pieces. Each call draws at {@link #y} and moves it down. */
export class Canvas {
  static PAD = 10;
  static BUTTON_H = 18;

  constructor(s, g, x0, y, x1, mx, my) {
    Object.assign(this, { s, g, x0, x1, y, mx, my });
  }

  left() {
    return this.x0 + Canvas.PAD;
  }

  right() {
    return this.x1 - Canvas.PAD;
  }

  space(pixels) {
    this.y += pixels;
  }

  buttonHeight() {
    return Canvas.BUTTON_H;
  }

  header(art, kind, title, summary, color) {
    this.y = this.s.drawHeader(this.g, this.x0, this.y, this.x1, art, kind, title, summary, color) + 8;
  }

  heading(text) {
    this.g.text(this.s.clip(text, this.right() - this.left()), this.left(), this.y, WHITE);
    this.y += 14;
  }

  text(text, color) {
    const w = this.right() - this.left();
    this.g.textWithWordWrap(text, this.left(), this.y, w, color);
    this.y += this.s.font.wrapHeight(text, w) + 2;
  }

  textField(key, hint, width, onSubmit) {
    const s = this.s, H = Canvas.BUTTON_H, mx = this.mx, my = this.my, y = this.y;
    let box = s.fields.get(key);
    if (!box) {
      box = new EditBox(s.font, 100, 9, hint, false);
      box.maxLength = 2048;
      s.fields.set(key, box);
    }
    s.fieldSubmits.set(key, onSubmit);
    const fx0 = this.left(), fx1 = Math.min(this.right(), this.left() + width), focused = box === s.focusedField;
    const hover = mx >= fx0 && mx < fx1 && my >= y && my < y + H;
    this.g.fill(fx0, y, fx1, y + H, focused ? WHITE : hover ? 0xFF8A8A8A : 0xFF3A3A3A);
    this.g.fill(fx0 + 1, y + 1, fx1 - 1, y + H - 1, 0xFF242424);
    box.x = fx0 + 6;
    box.y = y + (H - 8) / 2;
    box.w = fx1 - fx0 - 12;
    box.draw(this.g);
    const top = Math.max(y, s.centerY0), bottom = Math.min(y + H, s.centerY1);
    if (bottom > top) s.nextFieldHits.push({ x0: fx0, y0: top, x1: fx1, y1: bottom, key });
    return box.value;
  }

  setText(key, value) {
    this.s.fields.get(key)?.setValue(value);
  }

  buttonWidth(label) {
    return this.s.font.width(label) + 20;
  }

  /** A progress bar across the page. {@code fraction} below 0 shows an animated bar for unknown progress. */
  progress(fraction, label) {
    const g = this.g, bx0 = this.left(), bx1 = this.right(), w = bx1 - bx0;
    if (label) {
      g.text(this.s.clip(label, w), bx0, this.y, DIM);
      this.y += 11;
    }
    g.fill(bx0, this.y, bx1, this.y + 4, TRACK_BG);
    if (fraction >= 0) {
      g.fill(bx0, this.y, bx0 + Math.round(w * Math.min(1, fraction)), this.y + 4, GREEN);
    } else {
      // Unknown progress: a segment sweeping across.
      const seg = Math.max(20, Math.floor(w / 4)), sx = bx0 - seg + Math.floor((w + seg) * ((Date.now() % 1400) / 1400));
      g.fill(Math.max(bx0, sx), this.y, Math.min(bx1, sx + seg), this.y + 4, GREEN);
    }
    this.y += 10;
  }

  tabs(labels, picked, pick) {
    this.y = this.s.segmented(this.g, this.left(), this.y, this.right(), this.mx, this.my, labels, picked, pick) + 4;
  }

  button(x, label, style, enabled, click) {
    const s = this.s, g = this.g, H = Canvas.BUTTON_H, y = this.y, mx = this.mx, my = this.my;
    const w = this.buttonWidth(label), bx1 = x + w;
    const hover = enabled && mx >= x && mx < bx1 && my >= y && my < y + H && my >= s.centerY0 && my < s.centerY1;
    let fg;
    if (style === 'PRIMARY') {
      const bg = !enabled ? 0xFF2F5E40 : hover ? 0xFF3BE477 : GREEN;
      g.fill(x + 1, y, bx1 - 1, y + H, bg);
      g.fill(x, y + 1, bx1, y + H - 1, bg);
      fg = enabled ? BLACK : 0xFF1B3324;
    } else {
      const edge = !enabled ? 0xFF3A3A3A : style === 'DANGER' ? RED : hover ? WHITE : 0xFF8A8A8A;
      g.fill(x, y, bx1, y + H, edge);
      g.fill(x + 1, y + 1, bx1 - 1, y + H - 1, hover ? 0xFF2A2A2A : PANEL);
      fg = !enabled ? FAINT : style === 'DANGER' ? RED : WHITE;
    }
    g.text(label, x + 10, y + (H - 8) / 2, fg);
    if (enabled) {
      const top = Math.max(y, s.centerY0), bottom = Math.min(y + H, s.centerY1);
      if (bottom > top) s.hit(x, top, bx1, bottom, click);
    }
    return w;
  }

  tracks(listKey, tracks) {
    this.y = this.s.drawTrackList(this.g, this.x0, this.y, this.x1, this.mx, this.my, listKey, tracks);
  }
}

export { LINE, has };
