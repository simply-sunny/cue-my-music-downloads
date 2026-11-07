// The game's files, pulled from Mojang's servers when the page opens; the wiki keeps no copies.
// Textures and the game's strings come out of the client jar with one range request each (data.json
// says where each file sits).

const textDecoder = new TextDecoder();

/** One file out of the jar: its local header, then its bytes, inflated if they're deflated. */
async function entry(jar, [offset, size, method]) {
  // The local header is 30 bytes plus a name and an extra field; 512 covers both for these paths.
  // Busy, the server sometimes answers with the whole jar (41 MB) instead: stop that download and ask again.
  // Each file gets its own URL (the server ignores the query): the browser lets one request at a time use a URL.
  let res;
  for (let tries = 0; ; tries++) {
    const stop = new AbortController();
    res = await fetch(`${jar}?at=${offset}`, { cache: 'no-store', signal: stop.signal, headers: { Range: `bytes=${offset}-${offset + 30 + 512 + size}` } });
    if (res.status === 206) break;
    stop.abort();
    if (tries >= 3) throw new Error(`range request answered ${res.status}`);
    await new Promise(done => setTimeout(done, 250 * (tries + 1)));
  }
  const buf = new Uint8Array(await res.arrayBuffer()), view = new DataView(buf.buffer);
  const start = 30 + view.getUint16(26, true) + view.getUint16(28, true), data = buf.subarray(start, start + size);
  if (method === 0) return data;
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The game's font: its character tables, and the sheets they point into. */
export async function pullFont({ jar, font }) {
  const files = new Map(await Promise.all(Object.entries(font).map(async ([path, at]) => [path, await entry(jar, at)])));
  const [table] = [...files.keys()].filter(path => path.endsWith('.json'));
  const { providers } = JSON.parse(textDecoder.decode(files.get(table))), sheets = new Map();
  await Promise.all(providers.map(async ({ file }) => {
    const path = `assets/minecraft/textures/${file.replace('minecraft:', '')}`;
    sheets.set(file, await createImageBitmap(new Blob([files.get(path)], { type: 'image/png' })));
  }));
  return { providers, sheets };
}

/** Fetches every texture in data.json into {@code textures} (keyed like the mod's, "block/jukebox_top"), and the game's biome names into {@code strings}. */
export async function pullGameFiles(source, textures, strings) {
  const pull = async ([path, at]) => {
    const bytes = await entry(source.jar, at);
    if (path.endsWith('.json')) {
      for (const [k, v] of Object.entries(JSON.parse(textDecoder.decode(bytes)))) if (k.startsWith('biome.minecraft.')) strings[k] = v;
      return;
    }
    const key = path.replace(/^assets\/minecraft\/textures\/(?:gui\/)?/, '').replace(/\.png$/, '');
    textures.set(key, await createImageBitmap(new Blob([bytes], { type: 'image/png' })));
  };
  // Eight at a time.
  const queue = Object.entries(source.entries), failed = [];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) await pull(queue.shift()).catch(e => failed.push(e));
  }));
  if (failed.length) console.warn(`[cue-player] ${failed.length} game files didn't load`, failed[0]);
}
