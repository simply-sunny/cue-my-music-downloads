// The track pools, search, Radio and Home pages of CueScreen.

import { CueScreen, Canvas, WHITE, DIM, GREEN, BLACK, ROW_HOVER, PANEL, PLAYLIST_ART, LIKED_ART, RADIO_ART, DIVIDER, menuItem as item } from './screen.js';
import { roundButton, playIcon } from './gfx.js';
import { tr, has, hash, floorMod, initials, initialsArt, normalize, terms, matches, applyEdit, editAdd, editRemove, editEmpty,
  poolEdit, ALL, RADIO } from './model.js';

/** A block for each of the game's places, so each track pool looks like where it plays. */
const POOL_BLOCKS = {
  'music.menu': 'bookshelf', 'music.game': 'grass_block_side', 'music.creative': 'diamond_block', 'music.under_water': 'prismarine',
  'music.end': 'end_stone', 'music.dragon': 'dragon_egg', 'music.credits': 'obsidian', deep_dark: 'sculk', sulfur_caves: 'sulfur',
  dripstone_caves: 'dripstone_block', grove: 'powder_snow', jagged_peaks: 'packed_ice', lush_caves: 'moss_block', swamp: 'mud',
  forest: 'oak_log', old_growth_taiga: 'podzol_top', meadow: 'hay_block_side', cherry_grove: 'cherry_leaves', frozen_peaks: 'ice',
  snowy_slopes: 'snow', stony_peaks: 'calcite', flower_forest: 'flowering_azalea_leaves', desert: 'sand', badlands: 'red_sand',
  jungle: 'jungle_log', sparse_jungle: 'jungle_planks', bamboo_jungle: 'bamboo_block', nether_wastes: 'netherrack',
  warped_forest: 'warped_nylium', soul_sand_valley: 'soul_sand', crimson_forest: 'crimson_nylium', basalt_deltas: 'basalt_side',
};
/** Blocks an artist with no art of their own gets one of, behind their initials. */
export const ARTIST_BLOCKS = ['oak_planks', 'spruce_planks', 'cherry_planks', 'bamboo_planks', 'crimson_planks', 'warped_planks', 'bricks',
  'mud_bricks', 'stone_bricks', 'deepslate_tiles', 'moss_block', 'amethyst_block', 'prismarine', 'terracotta', 'blue_ice', 'copper_block',
  'lapis_block', 'purpur_block', 'quartz_bricks', 'red_sandstone', 'end_stone_bricks', 'honeycomb_block', 'glowstone', 'packed_mud', 'calcite'];
/** The usual order of the game's own pools in the menu; biomes come after, under their dimension. */
const POOL_ORDER = ['music.menu', 'music.game', 'music.creative', 'music.under_water', 'music.end', 'music.dragon', 'music.credits'];
const SEARCH_FIELD = 'search';

const path = id => id.slice(id.indexOf(':') + 1);

/** "cherry_grove" as "Cherry Grove". */
const words = id => id.split(/[._/]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

Object.assign(CueScreen.prototype, {
  // ------------------------------------------------------------------ pools

  gameMusicShown() {
    const all = this.lib.gameMusic();
    if (this.gamePool == null) return all;
    return all.filter(t => this.lib.inPool(t, this.gamePool));
  },

  /** A pool's name: the biome's own for biome music, otherwise the player's ("Survival" for music.game). */
  poolName(pool) {
    const p = path(pool), ns = pool.slice(0, pool.indexOf(':'));
    for (const place of ['music.overworld.', 'music.nether.']) {
      if (p.startsWith(place)) {
        const biome = p.slice(place.length), key = 'biome.' + ns + '.' + biome;
        return has(key) ? tr(key) : words(biome);
      }
    }
    const rest = p.startsWith('music.') ? p.slice(6) : p, key = 'cuemymusic.pool.' + rest;
    return has(key) ? tr(key) : words(rest);
  },

  poolEdited(pool) {
    return !editEmpty(poolEdit(this.cfg, pool));
  },

  setGamePool(pool) {
    this.gamePool = pool;
    this.scroll = 0;
    this.clearSelection();
  },

  /** The pool drop-down: all, the game's own pools, then the overworld's and the nether's biomes, each a list of its own. */
  openPoolMenu(x, y) {
    this.showMenu({ x, y, items: [item('none', tr('cuemymusic.pool.all'), () => this.setGamePool(null)), DIVIDER,
      ...this.poolItems(x, y, pools => this.setGamePool(pools[0]))] });
  },

  /** The game's pools in order: its own (the menu, Survival, Creative...), then the overworld's biomes, then the nether's. */
  sortedPools() {
    const rank = p => {
      const s = path(p);
      if (s.startsWith('music.overworld.')) return POOL_ORDER.length + 1;
      if (s.startsWith('music.nether.')) return POOL_ORDER.length + 2;
      const i = POOL_ORDER.indexOf(s);
      return i < 0 ? POOL_ORDER.length : i;
    };
    return [...this.lib.pools.keys()].sort((a, b) => rank(a) - rank(b) || this.poolName(a).localeCompare(this.poolName(b)));
  },

  /** A menu's rows for the pools: the game's own, then the overworld's and the nether's biomes, each a menu of its own. */
  poolItems(x, y, pick) {
    const items = [], overworld = [], nether = [];
    for (const p of this.sortedPools()) {
      if (path(p).startsWith('music.overworld.')) overworld.push(p);
      else if (path(p).startsWith('music.nether.')) nether.push(p);
      else items.push(item('none', this.poolName(p), () => pick([p])));
    }
    if (overworld.length || nether.length) items.push(DIVIDER);
    if (overworld.length) items.push(item('none', tr('cuemymusic.pool.overworld'), () => this.showMenu({ x, y, items: this.biomeItems(overworld, pick) })));
    if (nether.length) items.push(item('none', tr('cuemymusic.pool.nether'), () => this.showMenu({ x, y, items: this.biomeItems(nether, pick) })));
    return items;
  },

  /** A track pool's picture: the block of the place it plays in, or its initials for a place without one. */
  poolArt(pool) {
    const p = path(pool), biome = p.slice(p.lastIndexOf('.') + 1);
    const b = POOL_BLOCKS[p] || POOL_BLOCKS[biome];
    return b ? { tex: 'block/' + b } : initialsArt(this.poolName(pool));
  },

  /** A track pool's songs: the game's own, with your changes laid over. */
  poolTracks(pool) {
    const game = this.lib.gameMusic().filter(t => this.lib.inPool(t, pool)).map(t => t.id);
    return this.player.only(this.lib.tracksOf(applyEdit(game, poolEdit(this.cfg, pool))));
  },

  setPoolEdit(pool, e) {
    const edits = { ...this.cfg.poolEdits };
    if (!e || editEmpty(e)) delete edits[pool];
    else edits[pool] = e;
    this.cfg.poolEdits = edits;
  },

  /** Puts {@code tracks} in each of {@code pools}, so the game can play them there. */
  addToPools(tracks, pools) {
    for (const p of pools) {
      let e = poolEdit(this.cfg, p);
      for (const t of tracks) e = editAdd(e, t.id, this.lib.inPool(t, p));
      this.setPoolEdit(p, e);
    }
    this.player.replan();
    const where = pools.length === 1 ? this.poolName(pools[0]) : tr('cuemymusic.pool.and_more', this.poolName(pools[0]), pools.length - 1);
    this.showToast(tracks.length === 1 ? tr('cuemymusic.pool.added', where) : tr('cuemymusic.pool.added_many', tracks.length, where));
  },

  /** Takes {@code tracks} out of the pool, so the game no longer plays them there. */
  removeFromPool(tracks, pool) {
    let e = poolEdit(this.cfg, pool);
    for (const t of tracks) e = editRemove(e, t.id, this.lib.inPool(t, pool));
    this.setPoolEdit(pool, e);
    this.player.replan();
    this.showToast(tracks.length === 1 ? tr('cuemymusic.pool.removed', this.poolName(pool)) : tr('cuemymusic.pool.removed_many', tracks.length, this.poolName(pool)));
  },

  /** Puts the pool back as the game has it. */
  resetPool(pool) {
    this.setPoolEdit(pool, null);
    this.player.replan();
    this.showToast(tr('cuemymusic.pool.was_reset', this.poolName(pool)));
  },

  /** A track pool's right-click menu in the library: as any list's, then Reset once it's changed. */
  poolListMenu(pool) {
    const items = this.listMenu('pool:' + pool, this.poolTracks(pool), null);
    if (this.poolEdited(pool)) items.push(DIVIDER, item('reset', tr('cuemymusic.pool.reset'), () => this.resetPool(pool)));
    return items;
  },

  /** One row per biome; biomes that play exactly the same songs share a row, which keeps the list on screen. */
  biomeItems(biomes, pick) {
    const bySongs = new Map(), all = this.lib.gameMusic();
    for (const b of biomes) {
      const k = all.filter(t => this.lib.inPool(t, b)).map(t => t.id).join(',');
      if (!bySongs.has(k)) bySongs.set(k, []);
      bySongs.get(k).push(b);
    }
    return [...bySongs.values()].map(same => item('none',
      same.length === 1 ? this.poolName(same[0]) : tr('cuemymusic.pool.and_more', this.poolName(same[0]), same.length - 1), () => pick([...same])));
  },

  // ----------------------------------------------------------------- search

  openSearch() {
    this.open('SEARCH', null);
    this.focusSearch = true;
  },

  /** True if the page open is a list of songs, with its own search. */
  hasSongList() {
    return ['PLAYLIST', 'LIKED', 'DISLIKED', 'RADIO', 'LIST', 'ARTIST', 'PACK'].includes(this.view) && this.mixFrom == null;
  },

  /** A search box, the artists whose names match, and every song whose title, artist or album does. */
  drawSearch(g, x0, y, x1, mx, my) {
    const c = new Canvas(this, g, x0, y, x1, mx, my);
    this.bigText(g, tr('cuemymusic.search.title'), c.left(), y + 10, 2, WHITE);
    c.y += 36;
    const fresh = !this.fields.has(SEARCH_FIELD);
    // Enter plays the results from the top.
    const typed = c.textField(SEARCH_FIELD, tr('cuemymusic.search.hint'), c.right() - c.left(), text => {
      const songs = this.searchSongs(text);
      if (songs.length) this.player.play('search:' + text, songs, 0);
    });
    if (fresh && this.searchQuery) this.fields.get(SEARCH_FIELD).setValue(this.searchQuery);
    else this.searchQuery = typed;
    const found = this.searchSongs(this.searchQuery);
    if (this.focusSearch) {
      this.focusSearch = false;
      this.focus(this.fields.get(SEARCH_FIELD));
    }
    c.space(c.buttonHeight() + 12);

    const ts = terms(this.searchQuery);
    const artists = [...new Set(this.lib.tracks.filter(t => this.player.allows(t)).map(t => t.artist))]
      .filter(a => !ts.length || matches(normalize(a), ts)).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).slice(0, 24);
    if (!ts.length) {
      c.text(tr('cuemymusic.search.empty'), DIM);
      c.space(6);
    } else if (!artists.length && !found.length) {
      c.text(tr('cuemymusic.search.none', this.searchQuery.trim()), DIM);
      return c.y;
    }
    if (artists.length) {
      c.heading(tr(ts.length ? 'cuemymusic.search.artists' : 'cuemymusic.search.browse'));
      c.y = this.artistChips(g, c.left(), c.y, c.right(), mx, my, artists) + 10;
    }
    if (found.length) {
      c.heading(tr('cuemymusic.search.songs', found.length));
      c.y -= 6;
      c.tracks('search:' + this.searchQuery, found);
    }
    return c.y;
  },

  /** Artists as clickable chips, wrapping onto new lines. Returns the y below them. */
  artistChips(g, x0, y, x1, mx, my, artists) {
    let cx = x0;
    const h = 20;
    for (const artist of artists) {
      const name = this.clip(artist, x1 - x0 - 34), w = 30 + this.font.width(name);
      if (cx > x0 && cx + w > x1) {
        cx = x0;
        y += h + 4;
      }
      const hover = mx >= cx && mx < cx + w && my >= y && my < y + h && my >= this.centerY0 && my < this.centerY1;
      g.fill(cx, y, cx + w, y + h, hover ? 0xFF333333 : 0xFF242424);
      this.art(g, this.artistArt(artist), cx + 2, y + 2, 16);
      g.text(name, cx + 22, y + 6, hover ? WHITE : DIM);
      const top = Math.max(y, this.centerY0), bottom = Math.min(y + h, this.centerY1);
      if (bottom > top) this.hit(cx, top, cx + w, bottom, () => this.open('ARTIST', artist));
      cx += w + 4;
    }
    return y + h;
  },

  /** Songs matching every word of {@code query}. Titles that start with it first, then titles that contain it, then the rest. */
  searchSongs(query) {
    const ts = terms(query);
    if (!ts.length) return [];
    const whole = ts.join(' ');
    const rank = t => {
      const title = normalize(t.title);
      return title.startsWith(whole) ? 0 : title.includes(whole) ? 1 : normalize(t.artist).includes(whole) ? 2 : 3;
    };
    return this.player.only(this.lib.tracks).filter(t => matches(normalize(t.title + ' ' + t.artist + ' ' + t.album), ts))
      .sort((a, b) => rank(a) - rank(b) || a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
  },

  /** An artist's art: theirs, for the game's own artists; otherwise their initials over a block picked from their name. */
  artistArt(artist) {
    const own = this.lib.artistArt[artist];
    if (own) return { tex: own };
    const b = ARTIST_BLOCKS[floorMod(hash(artist), ARTIST_BLOCKS.length)];
    return this.textures.has('block/' + b) ? { text: initials(artist), block: 'block/' + b } : initialsArt(artist);
  },

  // ------------------------------------------------------------------ radio

  /** Radio: endless music picked for you, from a song or from everything. Its songs so far and next play like any other list. */
  drawRadio(g, x0, y, x1, mx, my) {
    const seed = this.player.radioSeed();
    const title = seed == null ? tr('cuemymusic.radio.title') : tr('cuemymusic.radio.song', seed.title);
    const summary = seed == null ? tr('cuemymusic.radio.summary') : tr('cuemymusic.radio.based_on', seed.title, seed.artist);
    // The mode says where its songs come from, so the page doesn't ask again.
    y = this.drawHeader(g, x0, y, x1, seed == null ? RADIO_ART : seed.art, tr('cuemymusic.radio.kind.' + this.mode()), title, summary, 0xFF24456B);
    const left = x0 + 10, right = x1 - 10;
    if (seed != null) {
      this.chip(g, left, y, tr('cuemymusic.radio.everything'), false, mx, my, () => {
        this.player.clearRadioSeed();
        this.showToast(tr('cuemymusic.radio.from_everything'));
      });
      y += 22;
    }
    const tracks = this.player.radioTracks();
    if (!tracks.length) {
      g.textWithWordWrap(tr('cuemymusic.radio.empty'), left, y + 4, right - left, DIM);
      return y + 24;
    }
    return this.drawTrackList(g, x0, y, x1, mx, my, RADIO, tracks);
  },

  // ------------------------------------------------------------------- home

  /** The list a player key names, if it's still there; null for one that isn't. */
  homeList(k) {
    const colon = k.indexOf(':'), kind = colon < 0 ? k : k.slice(0, colon), rest = colon < 0 ? '' : k.slice(colon + 1);
    const player = this.player, lib = this.lib, L = (name, art, open, play) => ({ key: k, name, art, open, play });
    switch (kind) {
      case ALL:
        return this.mode() === 'addons' ? null : L(tr('cuemymusic.playlist.title'), PLAYLIST_ART, () => this.open('PLAYLIST', null),
          () => player.playAll(k, this.gameMusicShown()));
      case 'liked':
        return !this.liked().length ? null : L(tr('cuemymusic.liked.title'), LIKED_ART, () => this.open('LIKED', null),
          () => player.playAll(k, this.liked()));
      case RADIO:
        return !this.radioHere() ? null : L(tr('cuemymusic.radio.title'), RADIO_ART, () => this.open('RADIO', null),
          () => player.startRadio(player.radioSeed()));
      case 'artist':
        return !player.only(lib.songsBy(rest)).length ? null : L(rest, this.artistArt(rest), () => this.open('ARTIST', rest),
          () => player.playAll(k, player.only(lib.songsBy(rest))));
      case 'pack': {
        const p = lib.pack(rest);
        return !p || !player.only(lib.byPack(rest)).length ? null : L(p.name, p.art, () => this.open('PACK', rest),
          () => player.playAll(k, player.only(lib.byPack(rest))));
      }
      case 'pool':
        return !lib.pools.has(rest) || this.mode() === 'addons' ? null : L(this.poolName(rest), this.poolArt(rest), () => this.open('POOL', rest),
          () => player.playAll(k, this.poolTracks(rest)));
      case 'list': {
        const p = this.playlist(rest);
        return !p ? null : L(p.name, initialsArt(p.name), () => this.open('LIST', rest), () => player.playAll(k, player.only(lib.tracksOf(p.songs))));
      }
      default:
        return null;
    }
  },

  /** A greeting, the lists played lately as tiles, then your top songs, your top artists, and radios from your top songs. */
  drawHome(g, x0, y, x1, mx, my) {
    const left = x0 + 12, right = x1 - 12, w = right - left;
    g.fillGradient(x0, y, x1, y + 90, 0xFF1E3A2A, PANEL);
    const hour = new Date().getHours();
    const greeting = tr(hour < 5 || hour >= 18 ? 'cuemymusic.home.evening' : hour < 12 ? 'cuemymusic.home.morning' : 'cuemymusic.home.afternoon');
    this.bigText(g, this.clip(greeting, Math.floor(w / 2)), left, y + 14, 2, WHITE);
    y += 38;

    // Lists played lately, then the ones everyone has, up to 8.
    const tiles = [];
    const keys = [...Object.entries(this.cfg.listsPlayed).sort((a, b) => b[1] - a[1]).map(e => e[0]), 'liked', ALL, RADIO];
    for (const k of keys) {
      if (tiles.length >= 8 || tiles.some(t => t.key === k)) continue;
      const l = this.homeList(k);
      if (l) tiles.push(l);
    }
    const cols = w >= 360 ? 4 : 2, gap = 6, tileW = Math.floor((w - gap * (cols - 1)) / cols), tileH = 28;
    tiles.forEach((l, i) => {
      const tx = left + (i % cols) * (tileW + gap), ty = y + Math.floor(i / cols) * (tileH + gap);
      const hover = mx >= tx && mx < tx + tileW && my >= ty && my < ty + tileH && my >= this.centerY0 && my < this.centerY1;
      g.fill(tx, ty, tx + tileW, ty + tileH, hover ? 0xFF3A3A3A : 0xFF2A2A2A);
      this.art(g, l.art, tx, ty, tileH);
      g.text(this.clip(l.name, tileW - tileH - (hover ? 30 : 10)), tx + tileH + 6, ty + 10, WHITE);
      this.hit(tx, ty, tx + tileW, ty + tileH, l.open);
      if (hover) {
        // Play, without opening it.
        const pb = 18, px = tx + tileW - pb - 4, py = ty + 5;
        roundButton(g, px, py, pb, GREEN);
        playIcon(g, px + 7, py + 5, 8, BLACK);
        this.hit(px, py, px + pb, py + pb, l.play);
      }
    });
    y += Math.floor((tiles.length + cols - 1) / cols) * (tileH + gap) + 14;

    const top = this.stats.top(24).map(id => this.lib.get(id)).filter(t => t && this.player.allows(t));
    if (!top.length) {
      const empty = tr('cuemymusic.home.empty');
      g.textWithWordWrap(empty, left, y, w, DIM);
      return y + this.font.wrapHeight(empty, w) + 8;
    }
    const card = 64, fit = Math.max(1, Math.floor((w + 8) / (card + 8)));
    y = this.homeRow(g, left, y, right, tr('cuemymusic.home.top_songs'), top.slice(0, fit), mx, my, t => t.art, t => t.title, t => t.artist,
      (t, i) => this.player.play('stats', top, i));

    const byArtist = new Map();
    for (const [id, song] of this.stats.songs) {
      const t = this.lib.get(id);
      if (t && this.player.allows(t) && song.seconds > 0) byArtist.set(t.artist, (byArtist.get(t.artist) || 0) + song.seconds);
    }
    const artists = [...byArtist.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]).slice(0, fit);
    y = this.homeRow(g, left, y, right, tr('cuemymusic.home.top_artists'), artists, mx, my, a => this.artistArt(a), a => a,
      () => tr('cuemymusic.artist'), a => this.open('ARTIST', a));

    if (!this.radioHere()) return y;
    return this.homeRow(g, left, y, right, tr('cuemymusic.home.radio'), top.slice(0, fit), mx, my, t => t.art,
      t => tr('cuemymusic.radio.song', t.title), t => t.artist, t => {
        this.player.startRadio(t);
        this.open('RADIO', null);
      });
  },

  /** A titled row of cards, each art over two lines of text; clicking one runs {@code click} with it and its place. */
  homeRow(g, left, y, right, title, items, mx, my, art, line1, line2, click) {
    if (!items.length) return y;
    this.bigText(g, title, left, y, 1.5, WHITE);
    y += 18;
    const card = 64;
    let cx = left;
    for (let i = 0; i < items.length; i++) {
      const it = items[i], h = card + 30;
      const hover = mx >= cx - 4 && mx < cx + card + 4 && my >= y - 4 && my < y + h && my >= this.centerY0 && my < this.centerY1;
      if (hover) g.fill(cx - 4, y - 4, cx + card + 4, y + h, ROW_HOVER);
      this.art(g, art(it), cx, y, card);
      g.text(this.clip(line1(it), card), cx, y + card + 5, WHITE);
      g.text(this.clip(line2(it), card), cx, y + card + 16, DIM);
      this.hit(cx - 4, y - 4, cx + card + 4, y + h, () => click(it, i));
      cx += card + 8;
      if (cx + card > right) break;
    }
    return y + card + 40;
  },
});
