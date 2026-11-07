// The Downloads page, ported from DownloadsPanel.java, on the web player's panel hook. Nothing leaves the page: searches
// run over the game's own soundtrack, and a download is a timer that adds the song to the player.

import { tr, STRINGS } from './model.js';
import { SCRIPTS, label, at, row } from './demos.js';

const BASE = new URL('.', import.meta.url);
const strings = await fetch(new URL('lang.json', BASE)).then(r => r.json());
const iconBitmap = await fetch(new URL('download.png', BASE)).then(r => r.blob()).then(createImageBitmap);

const SEARCH = 'search', FILTER = 'downloads_filter', RED = 0xFFFF6B6B, DIM = 0xFFB3B3B3, WHITE = 0xFFFFFFFF, GREEN = 0xFF1ED760;
const NAME = 'Cue My Music Downloads', ID = 'file/' + NAME, RECENT = 5, RESULTS = 10, MAX_RESULTS = 30;
const SORTS = ['relevance', 'plays', 'shortest', 'title'], ICON = { tex: 'cmmd/download' };
const k = key => 'cuemymusic_downloads.' + key, t = (key, ...args) => tr(k(key), ...args);
const time = s => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;
const shorten = (text, max) => (text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…');
const isLink = text => /^https?:\/\//i.test(text.trim());
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '_');
/** A page to open: an artist, an album, or an artist's whole list. */
const link = (kind, name, art) => ({ kind, name, art, subtitle: '', key: kind + '|' + name });

class DownloadsPanel {
  constructor({ lib, textures }) {
    this.lib = lib;
    Object.assign(STRINGS, strings);
    textures.set(ICON.tex, iconBitmap);
    if (!lib.pack(ID)) lib.packs.push({ id: ID, name: NAME, author: '', art: ICON });
    // A demo starts over on an empty pack.
    this.clearPack();
    this.tab = 0;
    this.sort = 0;
    this.recent = [];
    this.trail = [];
    this.picked = new Map();
    this.pickedOpen = false;
    this.search = null;
    this.job = null;
    this.result = null;
    this.confirm = null;
    this.catalogue = lib.gameMusic().map(s => ({ id: 'dl:' + s.id, title: s.title, artist: s.artist, album: s.album, seconds: s.seconds, art: s.art,
      url: 'https://music.youtube.com/watch?v=' + slug(s.title) }));
  }

  id() {
    return 'cuemymusic_downloads';
  }

  title() {
    return t('panel.title');
  }

  subtitle() {
    return this.job ? t('panel.busy') : t('panel.subtitle');
  }

  icon() {
    return ICON;
  }

  packId() {
    return ID;
  }

  songs() {
    return this.lib.byPack(ID);
  }

  have() {
    return new Set(this.songs().map(s => s.id));
  }

  clearPack() {
    const lib = this.lib;
    lib.tracks = lib.tracks.filter(s => s.packId !== ID);
    lib.byId = new Map(lib.tracks.map(s => [s.id, s]));
  }

  add(song) {
    if (this.lib.get(song.id)) return;
    const track = { ...song, packId: ID };
    this.lib.tracks.push(track);
    this.lib.byId.set(track.id, track);
  }

  deleteAction(tracks) {
    return { label: tracks.length === 1 ? t('panel.delete') : t('panel.delete_many', tracks.length), run: () => this.remove(tracks) };
  }

  remove(tracks) {
    const gone = new Set(tracks.map(s => s.id));
    this.lib.tracks = this.lib.tracks.filter(s => !gone.has(s.id));
    this.lib.byId = new Map(this.lib.tracks.map(s => [s.id, s]));
    this.result = { message: gone.size === 1 ? t('removed', tracks[0].title) : t('removed_many', gone.size), failed: false };
  }

  // ------------------------------------------------------------ the pretend back end

  /** Moves the search, the page being opened and the download on, by the clock. */
  tick() {
    const now = performance.now(), s = this.search, j = this.job;
    if (s?.running && now >= s.at) {
      s.running = false;
      s.results = this.find(s.query);
      s.artist = this.catalogue.find(r => r.artist.toLowerCase() === s.query.toLowerCase())?.artist ?? null;
    }
    if (this.opening && now >= this.opening) this.opening = 0;
    if (j && !j.reading) {
      const each = 1800;
      j.index = Math.min(j.songs.length - 1, Math.floor((now - j.at) / each));
      const part = Math.min(1, ((now - j.at) % each) / (each * 0.8)), n = j.songs.length, i = j.index + 1;
      for (const song of j.songs.slice(0, j.index)) this.add(song);
      j.fraction = (j.index + part) / n;
      j.label = part >= 1 ? (n > 1 ? t('converting_of', i, n) : t('converting')) : n > 1 ? t('progress_of', i, n, Math.floor(part * 100)) : t('progress', Math.floor(part * 100));
      if (now - j.at >= each * n) {
        j.songs.forEach(song => this.add(song));
        this.job = null;
        this.result = { message: j.done, failed: false };
      }
    } else if (j?.reading && now >= j.at) {
      j.reading = false;
      const song = this.catalogue.find(r => !this.have().has(r.id));
      this.job = null;
      if (song) this.confirm = { song, spotifySeconds: Math.round(song.seconds) + 2 };
    }
  }

  find(query) {
    const words = query.toLowerCase().split(/\s+/);
    return this.catalogue.filter(r => words.every(w => `${r.title} ${r.artist} ${r.album}`.toLowerCase().includes(w)));
  }

  start(songs, done, url) {
    if (songs.length) this.job = { songs, done, url, at: performance.now(), index: 0, fraction: -1, label: t('starting') };
    else this.result = { message: t('nothing_new'), failed: false };
  }

  startLink(c, text) {
    if (/spotify/i.test(text)) {
      this.job = { reading: true, at: performance.now() + 900, fraction: -1, label: t('spotify.reading'), songs: [] };
    } else {
      const song = this.catalogue.find(r => !this.have().has(r.id));
      this.start(song ? [song] : [], song && t('added', song.title), text.trim());
    }
    c.setText(SEARCH, '');
  }

  startSearch(query) {
    this.trail = [];
    this.search = { query, running: true, at: performance.now() + 600, results: [], artist: null, limit: RESULTS };
    this.recent = [query, ...this.recent.filter(q => q.toLowerCase() !== query.toLowerCase())].slice(0, RECENT);
  }

  submit(c, text) {
    if (!text.trim()) return;
    if (isLink(text)) this.startLink(c, text);
    else this.startSearch(text.trim());
  }

  // --------------------------------------------------------------------- drawing

  draw(c) {
    this.tick();
    const songs = this.songs();
    c.header(ICON, t('panel.kind'), this.title(), t('panel.summary', songs.length, NAME), 0xFF1E3E7A);
    c.tabs([t('panel.tab.download'), songs.length ? t('panel.tab.downloads_count', songs.length) : t('panel.tab.downloads')], this.tab, i => (this.tab = i));
    if (this.tab === 0) this.drawDownload(c);
    else this.drawDownloads(c, songs);
  }

  drawDownload(c) {
    const running = !!this.job, search = t('panel.search'), download = t('panel.download'), cancel = t('panel.cancel');
    const bw = Math.max(c.buttonWidth(search), c.buttonWidth(download), c.buttonWidth(cancel));
    const text = c.textField(SEARCH, t('panel.hint'), c.right() - c.left() - bw - 6, v => this.submit(c, v));
    if (text.trim() && !isLink(text)) c.button(c.right() - bw, search, 'PRIMARY', true, () => this.submit(c, text));
    else if (running) c.button(c.right() - bw, cancel, 'DANGER', true, () => this.cancel());
    else c.button(c.right() - bw, download, 'PRIMARY', !!text.trim(), () => this.submit(c, text));
    c.space(c.buttonHeight() + 8);

    if (running) c.progress(this.job.fraction, this.job.label);
    else if (this.result) c.text(this.result.message, this.result.failed ? RED : DIM);
    this.drawConfirm(c);
    this.drawPicked(c);
    if (this.trail.length) this.drawTrail(c);
    else if (!this.search) this.drawRecent(c);
    else this.drawResults(c);
    c.space(2);
    c.text(t('panel.about'), 0xFF6A6A6A);
  }

  cancel() {
    const j = this.job;
    this.job = null;
    this.result = { message: t('cancelled', j.index ?? 0), failed: false };
  }

  drawRecent(c) {
    if (!this.recent.length) return;
    c.space(6);
    c.text(t('panel.recent'), DIM);
    let x = c.left();
    for (const query of this.recent) {
      const text = shorten(query, 28), w = c.buttonWidth(text);
      if (x > c.left() && x + w > c.right()) {
        c.space(c.buttonHeight() + 6);
        x = c.left();
      }
      x += c.button(x, text, 'SECONDARY', true, () => this.startSearch(query)) + 6;
    }
    c.space(c.buttonHeight() + 8);
  }

  drawDownloads(c, songs) {
    c.heading(t('panel.downloaded_songs'));
    if (this.job) {
      c.progress(this.job.fraction, this.job.label);
      c.space(2);
    } else if (this.result) {
      c.text(this.result.message, this.result.failed ? RED : DIM);
      c.space(2);
    }
    const open = t('panel.folder'), bw = c.buttonWidth(open);
    const filter = c.textField(FILTER, t('panel.filter_hint'), Math.max(60, c.right() - c.left() - bw - 6), () => {});
    c.button(c.right() - bw, open, 'SECONDARY', true, () => {});
    c.space(c.buttonHeight() + 10);
    const f = filter.trim().toLowerCase(), shown = f ? songs.filter(s => `${s.title} ${s.artist}`.toLowerCase().includes(f)) : songs;
    if (!songs.length) c.text(t('panel.empty'), DIM);
    else if (!shown.length) c.text(t('panel.no_matches', filter.trim()), DIM);
    else c.tracks(f ? `pack:${ID}:filter:${f}` : 'pack:' + ID, shown);
  }

  sorted(results) {
    const out = [...results];
    if (SORTS[this.sort] === 'shortest') out.sort((a, b) => a.seconds - b.seconds);
    if (SORTS[this.sort] === 'title') out.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
    return out;
  }

  drawResults(c) {
    const st = this.search, g = c.g, s = c.s, bh = c.buttonHeight();
    c.space(8);
    const clear = t('panel.clear'), sortLabel = t('panel.sort.' + SORTS[this.sort]);
    let x = c.right() - c.buttonWidth(clear);
    c.button(x, clear, 'SECONDARY', true, () => (this.search = null));
    x -= c.buttonWidth(sortLabel) + 6;
    c.button(x, sortLabel, 'SECONDARY', true, () => (this.sort = (this.sort + 1) % SORTS.length));
    g.text(s.clip(t('panel.results', st.query), x - 8 - c.left()), c.left(), c.y + (bh - 8) / 2, WHITE);
    c.space(bh + 8);
    if (st.running) return c.progress(-1, t('panel.searching'));
    if (!st.results.length) return c.text(t('panel.no_results'), DIM);
    const have = this.have();
    if (st.artist) this.drawArtist(c, st.artist);
    const results = this.sorted(st.results).slice(0, st.limit), top = results[0];

    // The top result.
    const y = c.y, cardH = 72, art = 56;
    g.fill(c.left(), y, c.right(), y + cardH, 0xFF1E1E1E);
    s.art(g, top.art, c.left() + 8, y + 8, art);
    const tx = c.left() + art + 18, tw = c.right() - tx - 10;
    g.text(t(this.sort === 0 ? 'panel.top' : 'panel.first'), tx, y + 9, DIM);
    s.bigText(g, s.clip(top.title, Math.floor(tw / 1.5)), tx, y + 22, 1.5, WHITE);
    const buttonW = this.buttonWidth(c, top, have, true), open = '›', pick = this.pickLabel(top);
    const moreW = c.buttonWidth(open), pickW = c.buttonWidth(pick), rightOfLine = c.right() - 8 - buttonW - 6 - pickW - 6 - moreW;
    g.text(s.clip(this.line(top), rightOfLine - 10 - tx), tx, y + 41, DIM);
    c.space(cardH - bh - 8);
    this.downloadButton(c, top, have, c.right() - 8, true);
    const px = c.right() - 8 - buttonW - 6 - pickW;
    this.pickButton(c, top, have, px);
    c.button(px - 6 - moreW, open, 'SECONDARY', true, () => this.go(top));
    c.space(y + cardH + 12 - c.y);

    if (results.length >= 2) {
      g.text(t('panel.songs'), c.left(), c.y, WHITE);
      c.space(14);
      this.songRows(c, results.slice(1), have);
    }
    if (st.results.length > st.limit && st.limit < MAX_RESULTS) {
      c.space(4);
      const more = t('panel.show_more'), w = c.buttonWidth(more);
      c.button(c.left() + Math.max(0, Math.floor((c.right() - c.left() - w) / 2)), more, 'SECONDARY', true,
        () => (st.limit = Math.min(MAX_RESULTS, st.limit + RESULTS)));
      c.space(c.buttonHeight() + 6);
    }
  }

  // ------------------------------------------------------------------- browsing

  go(place) {
    this.trail.push(place);
    if (place.kind) this.opening = performance.now() + 350;
  }

  drawTrail(c) {
    const s = c.s, g = c.g;
    c.space(8);
    const bw = c.button(c.left(), '‹ ' + t('panel.back'), 'SECONDARY', true, () => this.trail.pop());
    let text = [this.search ? this.search.query : t('panel.search'), ...this.trail.map(p => p.title ?? p.name)].join('  ›  ');
    const room = c.right() - c.left() - bw - 10;
    while (s.font.width(text) > room && text.length > 4) text = '…' + text.slice(Math.min(text.length, 6));
    g.text(text, c.left() + bw + 10, c.y + (c.buttonHeight() - 8) / 2, DIM);
    c.space(c.buttonHeight() + 10);
    const here = this.trail.at(-1);
    if (here.kind) this.drawPage(c, here);
    else this.drawSong(c, here);
  }

  drawSong(c, r) {
    const g = c.g, s = c.s, have = this.have(), y = c.y, art = 72, bh = c.buttonHeight(), tx = c.left() + art + 12, tw = c.right() - tx;
    s.art(g, r.art, c.left(), y, art);
    g.text(t('panel.song'), tx, y + 2, DIM);
    s.bigText(g, s.clip(r.title, Math.floor(tw / 1.5)), tx, y + 14, 1.5, have.has(r.id) ? GREEN : WHITE);
    g.text(s.clip(this.line(r).slice(t('panel.song').length).replace(/^ · /, ''), tw), tx, y + 32, DIM);
    c.space(art - bh);
    const x = tx + this.pickButton(c, r, have, tx) + 6, w = this.buttonWidth(c, r, have, true);
    this.downloadButton(c, r, have, x + w, true);
    c.space(bh + 14);
    g.text(t('panel.by'), c.left(), c.y, WHITE);
    c.space(13);
    this.buttonRow(c, [link('ARTIST', r.artist, r.art)]);
    g.text(t('panel.on_album'), c.left(), c.y, WHITE);
    c.space(13);
    this.buttonRow(c, [link('ALBUM', r.album, r.art)]);
  }

  buttonRow(c, links) {
    let x = c.left();
    for (const l of links) {
      const text = shorten(l.name, 32) + ' ›', w = c.buttonWidth(text);
      if (x > c.left() && x + w > c.right()) {
        c.space(c.buttonHeight() + 6);
        x = c.left();
      }
      x += c.button(x, text, 'SECONDARY', true, () => this.go(l)) + 6;
    }
    c.space(c.buttonHeight() + 12);
  }

  /** An artist's page, or an album's, built from the catalogue. */
  page(l) {
    const songs = this.catalogue.filter(r => (l.kind === 'ALBUM' ? r.album : r.artist) === l.name);
    const albums = [...new Set(songs.map(r => r.album))];
    const count = n => `${n} songs`;
    return l.kind === 'ARTIST'
      ? { title: l.name, subtitle: count(songs.length), songs: songs.slice(0, 5), all: songs.length > 5 && link('PLAYLIST', l.name, l.art),
          sections: [{ title: 'Albums', items: albums.map(a => ({ ...link('ALBUM', a, songs.find(r => r.album === a).art), subtitle: l.name })) }] }
      : { title: l.kind === 'PLAYLIST' ? t('panel.all_songs_of', l.name) : l.name, subtitle: songs[0]?.artist ?? '', songs, sections: [] };
  }

  drawPage(c, l) {
    const g = c.g, s = c.s, bh = c.buttonHeight();
    if (this.opening) return c.progress(-1, t('panel.opening', l.name));
    const page = this.page(l), have = this.have(), y = c.y, art = 64, tx = c.left() + art + 12, tw = c.right() - tx, songs = page.songs;
    s.art(g, l.art, c.left(), y, art);
    g.text(t('panel.kind.' + l.kind.toLowerCase()), tx, y + 2, DIM);
    s.bigText(g, s.clip(page.title, Math.floor(tw / 1.5)), tx, y + 14, 1.5, WHITE);
    g.text(s.clip(page.subtitle, tw), tx, y + 32, DIM);
    c.space(art - bh);
    let x = tx;
    if (songs.length) {
      const fresh = songs.filter(r => !have.has(r.id));
      const all = songs.every(r => this.picked.has(r.id) || have.has(r.id));
      x += c.button(x, t(all ? 'panel.unpick_all' : 'panel.pick_all', songs.length), 'SECONDARY', fresh.length > 0, () => {
        for (const r of songs) {
          if (all) this.picked.delete(r.id);
          else if (!have.has(r.id) && !this.picked.has(r.id)) this.picked.set(r.id, r);
        }
      }) + 6;
      if (l.kind !== 'ARTIST') {
        x += c.button(x, t('panel.download_these', fresh.length), 'PRIMARY', fresh.length > 0 && !this.job,
          () => this.start(fresh, t('added_playlist', fresh.length, page.title), 'page:' + l.key)) + 6;
      }
    }
    if (l.kind === 'ARTIST') this.downloadAll(c, x, l.name);
    c.space(bh + 14);
    if (songs.length) {
      if (l.kind === 'ARTIST') {
        g.text(t('panel.top_songs'), c.left(), c.y + (bh - 8) / 2, WHITE);
        if (page.all) {
          const text = t('panel.show_all') + ' ›';
          c.button(c.right() - c.buttonWidth(text), text, 'SECONDARY', true, () => this.go(page.all));
        }
        c.space(bh + 6);
      }
      this.songRows(c, songs, have);
      c.space(8);
    }
    for (const section of page.sections) {
      g.text(section.title, c.left(), c.y + (bh - 8) / 2, WHITE);
      c.space(bh + 6);
      for (const item of section.items) this.linkRow(c, item);
      c.space(10);
    }
  }

  linkRow(c, l) {
    const g = c.g, s = c.s, y = c.y, rowH = 30, bh = c.buttonHeight();
    const hover = c.mx >= c.left() - 4 && c.mx < c.right() + 4 && c.my >= y && c.my < y + rowH;
    if (hover) g.fill(c.left() - 4, y, c.right() + 4, y + rowH, 0xFF2A2A2A);
    s.art(g, l.art, c.left(), y + 3, 24);
    const open = t('panel.open'), ow = c.buttonWidth(open), textW = c.right() - ow - 10 - (c.left() + 32);
    g.text(s.clip(l.name, textW), c.left() + 32, y + 5, WHITE);
    g.text(s.clip(l.subtitle, textW), c.left() + 32, y + 17, DIM);
    c.space(Math.floor((rowH - bh) / 2));
    c.button(c.right() - ow, open, 'SECONDARY', true, () => this.go(l));
    c.space(y + rowH - c.y);
  }

  songRows(c, songs, have) {
    const g = c.g, s = c.s, bh = c.buttonHeight(), albums = c.right() - c.left() > 420, rowH = 30, size = 24, more = '›';
    const moreW = c.buttonWidth(more), pickW = c.buttonWidth('✔'), downW = c.buttonWidth('100%');
    const downX = c.right() - downW, pickX = downX - 4 - pickW, moreX = pickX - 4 - moreW;
    const timeX = moreX - 8, albumX = c.left() + Math.floor((c.right() - c.left()) * 50 / 100), five = s.font.width('00:00');
    for (const r of songs) {
      const y = c.y, hover = c.mx >= c.left() - 4 && c.mx < c.right() + 4 && c.my >= y && c.my < y + rowH;
      if (this.picked.has(r.id)) g.fill(c.left() - 4, y, c.right() + 4, y + rowH, 0xFF1F3327);
      else if (hover) g.fill(c.left() - 4, y, c.right() + 4, y + rowH, 0xFF2A2A2A);
      s.art(g, r.art, c.left(), y + 3, size);
      const textX = c.left() + size + 8, textW = (albums ? albumX - 10 : timeX - five - 10) - textX;
      g.text(s.clip(r.title, textW), textX, y + 5, have.has(r.id) ? GREEN : WHITE);
      g.text(s.clip(r.artist, textW), textX, y + 17, DIM);
      if (albums) g.text(s.clip(r.album, timeX - five - 10 - albumX), albumX, y + 11, DIM);
      const length = time(r.seconds);
      g.text(length, timeX - s.font.width(length), y + 11, DIM);
      c.space(Math.floor((rowH - bh) / 2));
      c.button(moreX, more, 'SECONDARY', true, () => this.go(r));
      this.pickButton(c, r, have, pickX);
      this.downloadButton(c, r, have, c.right(), false);
      c.space(y + rowH - c.y);
    }
  }

  pickButton(c, r, have, x) {
    return c.button(x, this.pickLabel(r), this.picked.has(r.id) ? 'PRIMARY' : 'SECONDARY', !have.has(r.id), () => {
      if (!this.picked.delete(r.id)) this.picked.set(r.id, r);
    });
  }

  pickLabel(r) {
    return this.picked.has(r.id) ? '✔' : '+';
  }

  drawPicked(c) {
    const have = this.have();
    for (const id of this.picked.keys()) if (have.has(id)) this.picked.delete(id);
    if (!this.picked.size) return;
    const g = c.g, s = c.s;
    c.space(8);
    const y = c.y, bh = c.buttonHeight(), h = bh + 12;
    g.fill(c.left() - 4, y, c.right() + 4, y + h, 0xFF1F3327);
    g.fill(c.left() - 4, y, c.left() - 2, y + h, GREEN);
    const download = t('panel.download_picked'), clear = t('panel.clear'), show = t(this.pickedOpen ? 'panel.hide' : 'panel.show');
    const dx = c.right() - 6 - c.buttonWidth(download), cx = dx - 6 - c.buttonWidth(clear), sx = cx - 6 - c.buttonWidth(show);
    g.text(s.clip(t('panel.picked', this.picked.size), sx - 10 - (c.left() + 6)), c.left() + 6, y + (h - 8) / 2, WHITE);
    c.space(6);
    const songs = [...this.picked.values()];
    c.button(dx, download, 'PRIMARY', !this.job, () => {
      this.start(songs, t('added_playlist', songs.length, picksName(songs)), 'picked');
      this.picked.clear();
    });
    c.button(cx, clear, 'SECONDARY', true, () => this.picked.clear());
    c.button(sx, show, 'SECONDARY', true, () => (this.pickedOpen = !this.pickedOpen));
    c.space(h - 6 + 4);
    if (!this.pickedOpen) return;
    for (const r of songs) {
      const ry = c.y, x = '×', xw = c.buttonWidth(x);
      g.text(s.clip(`${r.title}  ·  ${r.artist}`, c.right() - xw - 10 - c.left()), c.left() + 6, ry + 4, DIM);
      c.button(c.right() - xw, x, 'SECONDARY', true, () => this.picked.delete(r.id));
      c.space(Math.max(16, bh + 2));
    }
    c.space(4);
  }

  drawConfirm(c) {
    const m = this.confirm;
    if (!m) return;
    c.space(8);
    c.text(t('panel.unsure'), 0xFFE0B04A);
    c.text(t('panel.spotify', m.song.title, m.song.artist, time(m.spotifySeconds)), DIM);
    c.text(t('panel.youtube', m.song.title, m.song.artist, time(m.song.seconds)), DIM);
    const close = () => (this.confirm = null);
    let x = c.left();
    x += c.button(x, t('panel.keep'), 'PRIMARY', true, () => {
      close();
      this.start([m.song], t('added', m.song.title), m.song.url);
    }) + 6;
    const skip = () => {
      close();
      this.result = { message: t('spotify.nothing_kept', 1), failed: false };
    };
    x += c.button(x, t('panel.skip'), 'SECONDARY', true, skip) + 6;
    c.button(x, t('panel.skip_all'), 'SECONDARY', true, skip);
    c.space(c.buttonHeight() + 8);
  }

  downloadAll(c, x, artist) {
    const url = 'artist:' + artist, current = this.job?.url === url;
    return c.button(x, current ? this.progress() : t('panel.download_all'), current ? 'SECONDARY' : 'PRIMARY', !this.job, () => {
      const have = this.have(), songs = this.catalogue.filter(r => r.artist === artist && !have.has(r.id));
      this.start(songs, t('added_artist', songs.length, artist), url);
    });
  }

  drawArtist(c, name) {
    const g = c.g, s = c.s, h = 36, bh = c.buttonHeight(), y = c.y, url = 'artist:' + name;
    const text = this.job?.url === url ? this.progress() : t('panel.download_all'), bw = c.buttonWidth(text);
    const open = t('panel.open'), ow = c.buttonWidth(open);
    g.fill(c.left(), y, c.right(), y + h, 0xFF1E1E1E);
    g.text(t('panel.artist'), c.left() + 8, y + 6, DIM);
    g.text(s.clip(name, c.right() - bw - ow - 30 - c.left()), c.left() + 8, y + 19, WHITE);
    c.space(Math.floor((h - bh) / 2));
    this.downloadAll(c, c.right() - 8 - bw, name);
    c.button(c.right() - 8 - bw - 6 - ow, open, 'SECONDARY', true, () => this.go(link('ARTIST', name, this.catalogue.find(r => r.artist === name).art)));
    c.space(y + h + 10 - c.y);
  }

  progress() {
    const f = this.job.fraction;
    return f >= 0 ? Math.round(f * 100) + '%' : '…';
  }

  line(r) {
    return [t('panel.song'), r.artist, r.album, time(r.seconds)].filter(Boolean).join(' · ');
  }

  downloadButton(c, r, have, right, big) {
    const enabled = !have.has(r.id) && !this.job, w = this.buttonWidth(c, r, have, big);
    c.button(right - w, this.downloadLabel(r, have, big), big && enabled ? 'PRIMARY' : 'SECONDARY', enabled, () => this.start([r], t('added', r.title), r.url));
  }

  downloadLabel(r, have, big) {
    if (have.has(r.id)) return big ? '✔ ' + t('panel.downloaded') : '✔';
    if (r.url === this.job?.url) return this.progress();
    return big ? '↓ ' + t('panel.download') : '↓';
  }

  buttonWidth(c, r, have, big) {
    return big ? c.buttonWidth(this.downloadLabel(r, have, true)) : c.buttonWidth('100%');
  }
}

function picksName(songs) {
  const { album, artist } = songs[0];
  return songs.every(r => r.album === album) ? album : songs.every(r => r.artist === artist) ? artist : t('panel.picked_name');
}

SCRIPTS.downloads = function* (d) {
  yield* d.say('Search for a song or artist.');
  yield* d.click(label(t('panel.hint')), { after: 300 });
  yield* d.type('C418');
  yield* d.key('Enter', { after: 1000 });
  yield* d.scroll(label(t('panel.search')), 3);
  yield* d.say('Press the arrow to download a song.');
  yield* d.click(label('↓', 0), { after: 2600 });
};

SCRIPTS.find = function* (d) {
  yield* d.say('Search for an artist.');
  yield* d.click(label(t('panel.hint')), { after: 300 });
  yield* d.type('C418');
  yield* d.key('Enter', { after: 1000 });
  yield* d.say('The Artist card comes first.');
  yield* d.click(label(t('panel.download_all')), { after: 2800 });
};

SCRIPTS.links = function* (d) {
  yield* d.say('Paste a link.');
  yield* d.click(label(t('panel.hint')), { after: 300 });
  yield* d.type('https://youtu.be/example');
  yield* d.key('Enter', { after: 2600 });
  yield* d.say('Unclear Spotify matches wait for you.');
  yield* d.type('https://open.spotify.com/track/example');
  yield* d.key('Enter', { after: 1400 });
  yield* d.click(label(t('panel.keep')), { after: 2600 });
};

SCRIPTS.downloaded = function* (d) {
  const panel = d.screen.panels[0];
  panel.catalogue.slice(0, 6).forEach(song => panel.add(song));
  yield* d.click(at(s => label('Downloaded')(s)), { after: 800 });
  yield* d.say('Filter by title or artist.');
  yield* d.click(label(t('panel.filter_hint')), { after: 300 });
  yield* d.type('c418');
  yield* d.wait(1000);
  yield* d.say('Right-click a song to delete it.');
  yield* d.click(row(1), { right: true, after: 1200 });
  yield* d.click(label(t('panel.delete')), { after: 2000 });
};

export default options => new DownloadsPanel(options);
