// Drawing for the web player: the same calls CueScreen makes on GuiGraphics, in GUI pixels, on a canvas.

const colors = new Map();
/** An ARGB int as a CSS colour. */
export function css(argb) {
  let c = colors.get(argb);
  if (!c) {
    const a = (argb >>> 24) & 255, r = (argb >>> 16) & 255, g = (argb >>> 8) & 255, b = argb & 255;
    c = `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
    colors.set(argb, c);
  }
  return c;
}

export const LINE = 9;
const FALLBACK = '8px sans-serif';

/** The game's font, read from its own files the way the game reads them: capitals 7 pixels tall, on a baseline 7 below the text's top. */
export class Font {
  constructor() {
    this.ctx = document.createElement('canvas').getContext('2d');
    this.ctx.font = FALLBACK;
    this.glyphs = new Map([[' ', { advance: 4 }], ['\u200c', { advance: 0 }]]);
    this.tints = new Map();
    this.cache = new Map();
  }

  /** Each sheet's cells become glyphs as wide as their rightmost pixel; the first sheet to have a character keeps it. */
  load({ providers, sheets }) {
    for (const { file, chars, ascent, height = 8 } of providers) {
      const sheet = sheets.get(file), cols = [...chars[0]].length, cw = sheet.width / cols, ch = sheet.height / chars.length, scale = height / ch;
      const canvas = Object.assign(document.createElement('canvas'), { width: sheet.width, height: sheet.height });
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(sheet, 0, 0);
      const { data } = ctx.getImageData(0, 0, sheet.width, sheet.height);
      const inked = (x, y) => { for (let i = 0; i < ch; i++) if (data[((y + i) * sheet.width + x) * 4 + 3]) return true; return false; };
      chars.forEach((row, j) => [...row].forEach((c, i) => {
        if (c === '\0' || this.glyphs.has(c)) return;
        const sx = i * cw, sy = j * ch;
        let w = cw;
        while (w > 0 && !inked(sx + w - 1, sy)) w--;
        this.glyphs.set(c, { sheet, sx, sy, sw: w, sh: ch, dw: w * scale, dh: height, top: 7 - ascent, advance: Math.floor(0.5 + w * scale) + 1 });
      }));
    }
    this.cache.clear();
  }

  /** The game draws what these sheets lack from Unifont, too large to fetch for a few characters: the browser's font stands in. */
  glyph(c) {
    let g = this.glyphs.get(c);
    if (!g) this.glyphs.set(c, g = { text: true, advance: Math.ceil(this.ctx.measureText(c).width) });
    return g;
  }

  /** {@code sheet} in one colour. */
  tint(sheet, rgb) {
    let tints = this.tints.get(rgb);
    if (!tints) this.tints.set(rgb, tints = new Map());
    let canvas = tints.get(sheet);
    if (!canvas) {
      canvas = Object.assign(document.createElement('canvas'), { width: sheet.width, height: sheet.height });
      const ctx = canvas.getContext('2d');
      ctx.drawImage(sheet, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = css((0xFF000000 | rgb) >>> 0);
      ctx.fillRect(0, 0, sheet.width, sheet.height);
      tints.set(sheet, canvas);
    }
    return canvas;
  }

  draw(ctx, s, x, y, color) {
    const c = color >>> 0, rgb = c & 0xFFFFFF, alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * (c >>> 24) / 255;
    for (const char of s) {
      const g = this.glyph(char);
      if (g.sheet) ctx.drawImage(this.tint(g.sheet, rgb), g.sx, g.sy, g.sw, g.sh, x, y + g.top, g.dw, g.dh);
      else if (g.text) {
        ctx.font = FALLBACK;
        ctx.fillStyle = css((0xFF000000 | rgb) >>> 0);
        ctx.fillText(char, x, y + 7);
      }
      x += g.advance;
    }
    ctx.globalAlpha = alpha;
  }

  width(s) {
    if (!s) return 0;
    let w = this.cache.get(s);
    if (w === undefined) {
      w = 0;
      for (const c of s) w += this.glyph(c).advance;
      if (this.cache.size > 4000) this.cache.clear();
      this.cache.set(s, w);
    }
    return w;
  }

  /** The longest start of {@code s} no wider than {@code w}. */
  substrByWidth(s, w) {
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.width(s.slice(0, mid)) <= w) lo = mid;
      else hi = mid - 1;
    }
    return s.slice(0, lo);
  }

  /** {@code s} broken into lines no wider than {@code w}, at spaces where it can be. */
  wrap(s, w) {
    const lines = [];
    for (const para of String(s).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const next = line ? line + ' ' + word : word;
        if (this.width(next) <= w || !line) {
          line = next;
          while (this.width(line) > w && line.length > 1) {
            const fit = this.substrByWidth(line, w) || line[0];
            lines.push(fit);
            line = line.slice(fit.length);
          }
        } else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  wrapHeight(s, w) {
    return this.wrap(s, w).length * LINE;
  }
}

/** GuiGraphics in GUI pixels: fills, gradients, text, textures, a scissor stack and a pose stack. */
export class Graphics {
  constructor(ctx, font, textures) {
    this.ctx = ctx;
    this.font = font;
    this.textures = textures;
    // Where text was drawn this frame, in GUI pixels, when something asks (the demos find what to click by its label).
    this.texts = null;
    this.clips = [];
  }

  fill(x0, y0, x1, y1, color) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    if (x1 === x0 || y1 === y0) return;
    this.ctx.fillStyle = css(color);
    this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  fillGradient(x0, y0, x1, y1, top, bottom) {
    const g = this.ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, css(top));
    g.addColorStop(1, css(bottom));
    this.ctx.fillStyle = g;
    this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  text(s, x, y, color, shadow = false) {
    if (!s) return;
    if (shadow) {
      const c = color >>> 0;
      const dark = (c & 0xFF000000) | (((c >>> 16 & 255) >> 2) << 16) | (((c >>> 8 & 255) >> 2) << 8) | ((c & 255) >> 2);
      this.font.draw(this.ctx, s, x + 1, y + 1, dark);
    }
    this.font.draw(this.ctx, s, x, y, color);
    if (this.texts) this.recordText(s, x, y);
  }

  recordText(s, x, y) {
    const m = this.ctx.getTransform(), k = this.base, w = this.font.width(s);
    const x0 = (m.a * x + m.e) / k, y0 = (m.d * y + m.f) / k, x1 = (m.a * (x + w) + m.e) / k, y1 = (m.d * (y + 8) + m.f) / k;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, c = this.clips.at(-1);
    if (c && (cx < c[0] || cx >= c[2] || cy < c[1] || cy >= c[3])) return;
    this.texts.push({ s, x0, y0, x1, y1 });
  }

  textWithWordWrap(s, x, y, w, color) {
    this.font.wrap(s, w).forEach((line, i) => this.text(line, x, y + i * LINE, color));
  }

  enableScissor(x0, y0, x1, y1) {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
    this.ctx.clip();
    const c = this.clips.at(-1);
    this.clips.push(c ? [Math.max(x0, c[0]), Math.max(y0, c[1]), Math.min(x1, c[2]), Math.min(y1, c[3])] : [x0, y0, x1, y1]);
  }

  disableScissor() {
    this.ctx.restore();
    this.clips.pop();
  }

  push() {
    this.ctx.save();
  }

  pop() {
    this.ctx.restore();
  }

  translate(x, y) {
    this.ctx.translate(x, y);
  }

  scale(x, y) {
    this.ctx.scale(x, y);
  }

  /** A texture's first 16×16 frame (blocks animated with frames are taller) drawn at {@code size}. */
  blit(path, x, y, size) {
    const img = this.textures.get(path);
    if (!img) {
      this.fill(x, y, x + size, y + size, 0xFF2A2A2A);
      return;
    }
    const w = img.width;
    this.ctx.drawImage(img, 0, 0, w, Math.min(w, img.height), x, y, size, size);
  }
}

// Icons, pixel for pixel as CueScreen draws them.

export function pixels(g, x, y, color, ...rows) {
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] === 'X') g.fill(x + c, y + r, x + c + 1, y + r + 1, color);
    }
  }
}

export function searchIcon(g, x, y, color) {
  pixels(g, x, y, color, '.XXXX....', 'X....X...', 'X....X...', 'X....X...', 'X....X...', '.XXXX....', '.....XX..', '......XX.', '.......XX');
}

export function homeIcon(g, x, y, color) {
  pixels(g, x, y, color, '....X....', '...XXX...', '..XXXXX..', '.XXXXXXX.', 'XXXXXXXXX', '.XX...XX.', '.XX...XX.', '.XX...XX.', '.XXXXXXX.');
}

export function roundButton(g, x, y, size, color) {
  g.fill(x + 2, y, x + size - 2, y + size, color);
  g.fill(x, y + 2, x + size, y + size - 2, color);
  g.fill(x + 1, y + 1, x + size - 1, y + size - 1, color);
}

export function playIcon(g, x, y, h, color) {
  for (let i = 0; i < h; i++) {
    const w = Math.min(i, h - 1 - i) + 1;
    g.fill(x, y + i, x + w, y + i + 1, color);
  }
}

export function pauseIcon(g, x, y, h, color) {
  g.fill(x, y, x + 2, y + h, color);
  g.fill(x + 4, y, x + 6, y + h, color);
}

export function nextIcon(g, x, y, h, color) {
  playIcon(g, x, y, h, color);
  g.fill(x + (h >> 1) + 1, y, x + (h >> 1) + 3, y + h, color);
}

export function previousIcon(g, x, y, h, color) {
  g.fill(x, y, x + 2, y + h, color);
  for (let i = 0; i < h; i++) {
    const w = Math.min(i, h - 1 - i) + 1;
    g.fill(x + 2 + (h >> 1) + 1 - w, y + i, x + 2 + (h >> 1) + 1, y + i + 1, color);
  }
}

export function clockIcon(g, x, y, color) {
  g.fill(x + 1, y, x + 6, y + 1, color);
  g.fill(x + 1, y + 6, x + 6, y + 7, color);
  g.fill(x, y + 1, x + 1, y + 6, color);
  g.fill(x + 6, y + 1, x + 7, y + 6, color);
  g.fill(x + 3, y + 2, x + 4, y + 4, color);
  g.fill(x + 4, y + 3, x + 5, y + 4, color);
}

export function arrow(g, x, y, up, color) {
  for (let i = 0; i < 3; i++) {
    const row = up ? i : 2 - i;
    g.fill(x + 2 - row, y + i + 1, x + 3 + row, y + i + 2, color);
  }
}

export function dislikeIcon(g, x, y, filled, color) {
  const rows = filled
    ? ['XX.XXXXX.', 'XX.XXXXX.', 'XX.XXXXXX', 'XX.XXXXX.', 'XX.XXXXXX', 'XX.XXXXX.', '...XXX...', '...XX....', '....X....']
    : ['XX.XXXXX.', 'XX.X...X.', 'XX.X....X', 'XX.X...X.', 'XX.X....X', 'XX.XX..X.', '...X.XX..', '...X.X...', '....X....'];
  pixels(g, x, y, color, ...rows);
}

export function heartIcon(g, x, y, filled, color) {
  const rows = filled
    ? ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...']
    : ['.XX.XX.', 'X..X..X', 'X.....X', '.X...X.', '..X.X..', '...X...'];
  pixels(g, x, y, color, ...rows);
}

export function applyingIcon(g, x, y, progress, colors) {
  const dots = [[3, 0], [5, 1], [6, 3], [5, 5], [3, 6], [1, 5], [0, 3], [1, 1]];
  const lit = Math.ceil(progress * dots.length), spin = Math.floor(Date.now() / 100) % dots.length;
  dots.forEach(([dx, dy], i) => {
    const c = i < lit ? colors.GREEN : i === spin ? colors.WHITE : colors.FAINT;
    g.fill(x + dx, y + dy, x + dx + 1, y + dy + 1, c);
  });
}

export function repeatIcon(g, x, y, mode, color) {
  g.fill(x + 1, y + 1, x + 8, y + 2, color);
  g.fill(x + 8, y + 2, x + 9, y + 4, color);
  g.fill(x + 6, y, x + 7, y + 1, color);
  g.fill(x + 6, y + 2, x + 7, y + 3, color);
  g.fill(x + 1, y + 6, x + 8, y + 7, color);
  g.fill(x, y + 3, x + 1, y + 6, color);
  g.fill(x + 2, y + 5, x + 3, y + 6, color);
  g.fill(x + 2, y + 7, x + 3, y + 8, color);
  if (mode === 'one') {
    g.fill(x + 4, y + 2, x + 5, y + 6, color);
    g.fill(x + 3, y + 3, x + 4, y + 4, color);
  }
}

export function shuffleIcon(g, x, y, color) {
  pixels(g, x, y, color, '......X..', 'XX...XXX.', '..X.X.X..', '...X.....', '...X.....', '..X.X.X..', 'XX...XXX.', '......X..');
}

export function plusIcon(g, x, y, color) {
  g.fill(x, y + 4, x + 9, y + 5, color);
  g.fill(x + 4, y, x + 5, y + 9, color);
}

export function crossIcon(g, x, y, color) {
  for (let i = 0; i < 7; i++) {
    g.fill(x + i, y + i, x + i + 1, y + i + 1, color);
    g.fill(x + 6 - i, y + i, x + 7 - i, y + i + 1, color);
  }
}

export function chevron(g, x, y, color) {
  for (let i = 0; i < 3; i++) {
    g.fill(x + i, y + i, x + i + 1, y + i + 1, color);
    g.fill(x + 4 - i, y + i, x + 5 - i, y + i + 1, color);
  }
}

/** A filled box with each corner pixel snipped off. */
export function box(g, x0, y0, x1, y1, color) {
  g.fill(x0 + 1, y0, x1 - 1, y1, color);
  g.fill(x0, y0 + 1, x0 + 1, y1 - 1, color);
  g.fill(x1 - 1, y0 + 1, x1, y1 - 1, color);
}

export function speakerIcon(g, x, y, v, color) {
  g.fill(x, y + 4, x + 3, y + 7, color);
  g.fill(x + 3, y + 3, x + 4, y + 8, color);
  g.fill(x + 4, y + 2, x + 5, y + 9, color);
  g.fill(x + 5, y + 1, x + 6, y + 10, color);
  if (v <= 0) {
    for (let i = 0; i < 4; i++) {
      g.fill(x + 7 + i, y + 4 + i, x + 8 + i, y + 5 + i, color);
      g.fill(x + 10 - i, y + 4 + i, x + 11 - i, y + 5 + i, color);
    }
    return;
  }
  g.fill(x + 7, y + 4, x + 8, y + 7, color);
  if (v > 0.33) g.fill(x + 9, y + 2, x + 10, y + 9, color);
  if (v > 0.66) g.fill(x + 11, y, x + 12, y + 11, color);
}

export function equalizerIcon(g, x, y, color) {
  const t = Date.now();
  for (let i = 0; i < 3; i++) {
    const h = 2 + Math.round(3.5 * (1 + Math.sin(t / (140 + i * 45) + i * 1.7)));
    g.fill(x + i * 3, y + 9 - h, x + i * 3 + 2, y + 9, color);
  }
}

export function menuIcon(g, icon, x, y, color, RED) {
  switch (icon) {
    case 'plus': return plusIcon(g, x, y, color);
    case 'like': return heartIcon(g, x + 1, y + 2, false, color);
    case 'liked': return heartIcon(g, x + 1, y + 2, true, color);
    case 'dislike': return dislikeIcon(g, x, y, false, color);
    case 'disliked': return dislikeIcon(g, x, y, true, color);
    case 'queue': return pixels(g, x, y, color, '.X.......', 'XXX.XXXXX', '.X.......', '.........', 'XXXXXXXXX', '.........', '.........', 'XXXXXXXXX', '.........');
    case 'play': return pixels(g, x, y + 1, color, 'XX.......', 'XXXX.....', 'XXXXXX...', 'XXXXXXXX.', 'XXXXXX...', 'XXXX.....', 'XX.......');
    case 'radio': return pixels(g, x, y, color, '.X.....X.', 'X..X.X..X', 'X.X...X.X', 'X.X.X.X.X', 'X.X...X.X', 'X..X.X..X', '.X.....X.', '....X....', '...XXX...');
    case 'pool': return pixels(g, x, y, color, '...XXXXXX', '...X....X', '...X....X', '...X....X', '.XXX..XXX', 'XXXX.XXXX', '.XX...XX.');
    case 'reset': return pixels(g, x, y, color, '..XXXX.X.', '.X....XX.', 'X....XXX.', 'X........', 'X.......X', 'X.......X', '.X.....X.', '..XXXXX..');
    case 'artist': return pixels(g, x, y, color, '...XXX...', '..X...X..', '..X...X..', '..X...X..', '...XXX...', '.........', '.XXXXXXX.', 'X.......X', 'X.......X');
    case 'remove': return pixels(g, x, y, color, '..XXXXX..', '.X.....X.', 'X.......X', 'X.......X', 'X.XXXXX.X', 'X.......X', 'X.......X', '.X.....X.', '..XXXXX..');
    case 'delete': return pixels(g, x, y, RED, '...XXX...', 'XXXXXXXXX', '.X.....X.', '.X.X.X.X.', '.X.X.X.X.', '.X.X.X.X.', '.X.X.X.X.', '.X.....X.', '..XXXXX..');
    default:
  }
}
