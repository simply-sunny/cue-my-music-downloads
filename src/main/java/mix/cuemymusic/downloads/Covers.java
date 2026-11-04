package mix.cuemymusic.downloads;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.imageio.ImageIO;

import com.mojang.blaze3d.platform.NativeImage;

import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;

/**
 * Cover art for search results: fetched in the background, cropped square,
 * and made into a texture. Until it's ready, or if it can't be, there's none.
 */
final class Covers {
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8)).followRedirects(HttpClient.Redirect.NORMAL).build();
    private static final ExecutorService FETCH = Executors.newFixedThreadPool(3, r -> {
        Thread t = new Thread(r, "Cue My Music covers");
        t.setDaemon(true);
        return t;
    });
    /** A loaded cover: its texture and its width and height in pixels (it's square). */
    record Cover(Identifier id, int size) {
    }

    /** By link: the cover once loaded, or {@link #PENDING} while loading or after failing. */
    private static final Map<String, Cover> LOADED = new ConcurrentHashMap<>();
    private static final Cover PENDING = new Cover(Identifier.fromNamespaceAndPath("cuemymusic_downloads", "pending"), 0);
    private static int next;

    private Covers() {
    }

    /** The cover at {@code url} as a texture, or null if it isn't loaded (it starts loading). */
    static Cover get(String url) {
        if (url == null || url.isEmpty()) return null;
        Cover c = LOADED.get(url);
        if (c == null && LOADED.putIfAbsent(url, PENDING) == null) FETCH.execute(() -> fetch(url));
        return c == PENDING ? null : c;
    }

    /**
     * The album cover of {@code artist}'s {@code title}, from the iTunes Search API, as a PNG
     * {@code size} pixels across. Null if iTunes doesn't have that song by that artist.
     *
     * @throws java.io.IOException if iTunes can't be reached or asks to slow down: ask again later
     */
    static byte[] albumCover(String artist, String title, int size) throws java.io.IOException {
        String wantArtist = plain(artist), wantTitle = plain(title);
        if (wantArtist.isEmpty() || wantTitle.isEmpty()) return null;
        try {
            String term = java.net.URLEncoder.encode(artist + " " + title, java.nio.charset.StandardCharsets.UTF_8);
            HttpResponse<String> r = HTTP.send(HttpRequest.newBuilder(URI.create(
                    "https://itunes.apple.com/search?entity=song&limit=10&term=" + term)).timeout(Duration.ofSeconds(10)).build(),
                    HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() != 200) throw new java.io.IOException("iTunes answered " + r.statusCode());
            var results = com.google.gson.JsonParser.parseString(r.body()).getAsJsonObject().getAsJsonArray("results");
            for (var e : results) {
                var o = e.getAsJsonObject();
                if (!o.has("artistName") || !o.has("trackName") || !o.has("artworkUrl100")) continue;
                String gotArtist = plain(o.get("artistName").getAsString()), gotTitle = plain(o.get("trackName").getAsString());
                // The same song by the same artist: a remix or a namesake's song would have the wrong cover.
                if (!(gotArtist.contains(wantArtist) || wantArtist.contains(gotArtist)) || !gotTitle.equals(wantTitle)) continue;
                String url = o.get("artworkUrl100").getAsString().replace("100x100bb", "600x600bb");
                HttpResponse<byte[]> art = HTTP.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(10)).build(),
                        HttpResponse.BodyHandlers.ofByteArray());
                return art.statusCode() == 200 ? squarePng(art.body(), size) : null;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new java.io.IOException(e);
        } catch (RuntimeException e) {
            // An answer that isn't what iTunes sends: no cover to be had from it.
            DownloadsClient.LOG.debug("Couldn't read iTunes' answer for {} - {}: {}", artist, title, e.toString());
        }
        return null;
    }

    /** {@code s} lower case, without anything in brackets ("(feat. ...)", "[Official Video]") or punctuation. */
    private static String plain(String s) {
        return s.toLowerCase(Locale.ROOT).replaceAll("\\([^)]*\\)|\\[[^]]*\\]", " ").replaceAll("[^\\p{L}\\p{N}]+", " ").strip();
    }

    /** A song's cover from its YouTube video: the thumbnail, made square. Null if there's none. */
    static byte[] songCover(String videoId) {
        try {
            HttpResponse<byte[]> r = HTTP.send(HttpRequest.newBuilder(URI.create("https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg"))
                    .timeout(Duration.ofSeconds(10)).build(), HttpResponse.BodyHandlers.ofByteArray());
            return r.statusCode() == 200 ? squarePng(r.body(), 128) : null;
        } catch (Exception e) {
            DownloadsClient.LOG.debug("Couldn't get the cover of {}: {}", videoId, e.toString());
            return null;
        }
    }

    /**
     * {@code image} (JPEG or PNG) cut to a square from its middle, as a PNG,
     * {@code size} pixels across (or as it is, for 0). Null if it can't be read.
     */
    static byte[] squarePng(byte[] image, int size) throws java.io.IOException {
        // Covers come as JPEG; the game reads PNG.
        BufferedImage img = ImageIO.read(new ByteArrayInputStream(image));
        if (img == null) return null;
        int side = Math.min(img.getWidth(), img.getHeight());
        // A video's thumbnail is 4:3 with black bars above and below a 16:9 picture: take a square from the picture.
        if (img.getWidth() * 3 == img.getHeight() * 4) side = img.getWidth() * 9 / 16;
        BufferedImage square = img.getSubimage((img.getWidth() - side) / 2, (img.getHeight() - side) / 2, side, side);
        if (size > 0 && size != side) {
            BufferedImage scaled = new BufferedImage(size, size, BufferedImage.TYPE_INT_RGB);
            java.awt.Graphics2D g = scaled.createGraphics();
            g.setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION, java.awt.RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.drawImage(square, 0, 0, size, size, null);
            g.dispose();
            square = scaled;
        }
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        ImageIO.write(square, "png", png);
        return png.toByteArray();
    }

    private static void fetch(String url) {
        try {
            HttpResponse<byte[]> r = HTTP.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(10)).build(),
                    HttpResponse.BodyHandlers.ofByteArray());
            if (r.statusCode() != 200) return;
            byte[] png = squarePng(r.body(), 0);
            if (png == null) return;
            NativeImage image = NativeImage.read(png);
            Minecraft.getInstance().execute(() -> {
                Identifier id = Identifier.fromNamespaceAndPath("cuemymusic_downloads", "cover/" + (next++));
                Minecraft.getInstance().getTextureManager().register(id, new DynamicTexture(() -> "cover " + url, image));
                LOADED.put(url, new Cover(id, image.getWidth()));
            });
        } catch (Exception e) {
            DownloadsClient.LOG.debug("Couldn't load cover {}: {}", url, e.toString().toLowerCase(Locale.ROOT));
        }
    }
}
