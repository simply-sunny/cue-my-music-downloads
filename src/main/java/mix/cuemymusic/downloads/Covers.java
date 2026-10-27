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

    private static void fetch(String url) {
        try {
            HttpResponse<byte[]> r = HTTP.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(10)).build(),
                    HttpResponse.BodyHandlers.ofByteArray());
            if (r.statusCode() != 200) return;
            // Covers come as JPEG; the game reads PNG.
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(r.body()));
            if (img == null) return;
            int side = Math.min(img.getWidth(), img.getHeight());
            // A video's thumbnail is 4:3 with black bars above and below a 16:9 picture: take a square from the picture.
            if (img.getWidth() * 3 == img.getHeight() * 4) side = img.getWidth() * 9 / 16;
            BufferedImage square = img.getSubimage((img.getWidth() - side) / 2, (img.getHeight() - side) / 2, side, side);
            ByteArrayOutputStream png = new ByteArrayOutputStream();
            ImageIO.write(square, "png", png);
            NativeImage image = NativeImage.read(png.toByteArray());
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
