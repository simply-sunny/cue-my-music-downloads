package mix.cuemymusic.downloads;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import java.util.stream.Stream;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;

/**
 * Runs one link at a time on a background thread: yt-dlp downloads the
 * audio, ffmpeg converts it to Ogg Vorbis, then it moves into
 * {@link DownloadPack} and resources reload.
 */
final class Downloader {
    private static final String PROGRESS = "CMMPROGRESS ";
    private static final String DONE = "CMMDONE ";
    /** Longer videos and live streams are skipped. An hour of Ogg is about 50 MB. */
    private static final String FILTER = "!is_live & duration <? 3600";

    private static Process process;
    private static Thread worker;
    private static volatile boolean cancelled;

    private Downloader() {
    }

    static synchronized boolean running() {
        return worker != null && worker.isAlive();
    }

    /** Starts downloading {@code url}. Returns false if a download is already running. */
    static synchronized boolean start(String url, Tools tools) {
        if (running()) return false;
        cancelled = false;
        worker = new Thread(() -> run(url, tools), "Cue My Music download");
        worker.setDaemon(true);
        worker.start();
        return true;
    }

    /** Stops the running download. Returns false if nothing was running. */
    static synchronized boolean cancel() {
        if (!running()) return false;
        cancelled = true;
        if (process != null) {
            process.descendants().forEach(ProcessHandle::destroy);
            process.destroy();
        }
        return true;
    }

    private static void run(String url, Tools tools) {
        Path tmp = null;
        try {
            tmp = Files.createTempDirectory("cuemymusic-download");
            say(Component.translatable("cuemymusic_downloads.started"));

            // 1. The best audio-only format, as the site serves it.
            JsonObject[] done = new JsonObject[1];
            String[] error = new String[1];
            int[] shown = {-1};
            List<String> tail = new ArrayList<>();
            int code = exec(List.of(
                    tools.ytDlp().toString(),
                    "--format", "bestaudio/best",
                    "--ffmpeg-location", tools.ffmpeg().getParent().toString(),
                    "--no-playlist", "--playlist-items", "1",
                    "--match-filters", FILTER,
                    "--newline", "--progress",
                    "--progress-template", "download:" + PROGRESS + "%(progress._percent_str)s",
                    "--print", "after_move:" + DONE
                            + "%(.{filepath,id,extractor_key,webpage_url,title,track,artist,creator,uploader,album})j",
                    "--no-simulate", "--no-warnings",
                    "--output", tmp.resolve("%(id)s.%(ext)s").toString(),
                    "--", url), line -> {
                if (line.startsWith(PROGRESS)) {
                    int percent = percent(line.substring(PROGRESS.length()));
                    if (percent >= 0 && percent != shown[0]) {
                        shown[0] = percent;
                        bar(Component.translatable("cuemymusic_downloads.progress", percent));
                    }
                } else if (line.startsWith(DONE)) {
                    if (JsonParser.parseString(line.substring(DONE.length())) instanceof JsonObject o) done[0] = o;
                } else {
                    if (line.startsWith("ERROR:")) error[0] = line.substring("ERROR:".length()).strip();
                    tail.add(line);
                    if (tail.size() > 20) tail.removeFirst();
                }
            });
            if (cancelled) return;
            if (code != 0) {
                DownloadsClient.LOG.warn("yt-dlp exited with {}:\n{}", code, String.join("\n", tail));
                fail(Component.translatable("cuemymusic_downloads.failed", error[0] != null ? error[0] : "yt-dlp exited with " + code));
                return;
            }
            JsonObject info = done[0];
            if (info == null) {
                fail(Component.translatable("cuemymusic_downloads.skipped"));
                return;
            }
            Path download = Path.of(text(info, "filepath"));
            if (!Files.isRegularFile(download)) {
                fail(Component.translatable("cuemymusic_downloads.failed", "yt-dlp didn't save a file"));
                return;
            }

            // 2. Ogg Vorbis, the only format the game streams.
            bar(Component.translatable("cuemymusic_downloads.converting"));
            Path ogg = tmp.resolve("song.ogg");
            List<String> cmd = new ArrayList<>(List.of(
                    tools.ffmpeg().toString(), "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                    "-i", download.toString(), "-vn", "-map_metadata", "-1", "-ac", "2"));
            // Homebrew's ffmpeg has no libvorbis; ffmpeg's own encoder is marked experimental but plays fine.
            cmd.addAll(hasLibVorbis(tools) ? List.of("-c:a", "libvorbis", "-q:a", "5")
                    : List.of("-c:a", "vorbis", "-strict", "experimental", "-q:a", "6"));
            cmd.add(ogg.toString());
            tail.clear();
            code = exec(cmd, tail::add);
            if (cancelled) return;
            if (code != 0 || !Files.isRegularFile(ogg)) {
                DownloadsClient.LOG.warn("ffmpeg exited with {}:\n{}", code, String.join("\n", tail));
                fail(Component.translatable("cuemymusic_downloads.failed",
                        tail.isEmpty() ? "ffmpeg exited with " + code : tail.getLast()));
                return;
            }

            // 3. Into the pack, then reload so the player sees it.
            String title = first(text(info, "track"), text(info, "title"), text(info, "id"));
            String artist = first(text(info, "artist"), text(info, "creator"), uploader(text(info, "uploader")));
            String sourceId = text(info, "extractor_key").toLowerCase(Locale.ROOT) + "_" + text(info, "id");
            DownloadPack.Added added = DownloadPack.add(ogg, title, artist, text(info, "album"),
                    first(text(info, "webpage_url"), url), sourceId);
            Minecraft.getInstance().execute(() -> {
                DownloadPack.apply();
                say(Component.translatable(added.replaced() ? "cuemymusic_downloads.updated" : "cuemymusic_downloads.added",
                        added.song().title()));
            });
        } catch (Exception e) {
            if (!cancelled) {
                DownloadsClient.LOG.warn("Download failed", e);
                fail(Component.translatable("cuemymusic_downloads.failed", String.valueOf(e.getMessage())));
            }
        } finally {
            if (cancelled) say(Component.translatable("cuemymusic_downloads.cancelled"));
            if (tmp != null) delete(tmp);
        }
    }

    /** Runs a tool, passing each line it prints to {@code lines}. Returns its exit code, or -1 if cancelled first. */
    private static int exec(List<String> cmd, Consumer<String> lines) throws IOException, InterruptedException {
        Process p;
        synchronized (Downloader.class) {
            if (cancelled) return -1;
            p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
            process = p;
        }
        try (BufferedReader out = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = out.readLine()) != null) lines.accept(line);
        } finally {
            synchronized (Downloader.class) {
                process = null;
            }
        }
        return p.waitFor();
    }

    private static Boolean libVorbis;

    private static boolean hasLibVorbis(Tools tools) throws IOException, InterruptedException {
        if (libVorbis == null) {
            boolean[] found = {false};
            exec(List.of(tools.ffmpeg().toString(), "-hide_banner", "-encoders"), line -> {
                if (line.contains(" libvorbis ")) found[0] = true;
            });
            libVorbis = found[0];
        }
        return libVorbis;
    }

    /** " 42.7%" as 42, or -1 if yt-dlp didn't know the size. */
    private static int percent(String s) {
        try {
            return (int) Double.parseDouble(s.strip().replace("%", ""));
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    /** YouTube's auto-made "Artist - Topic" channels are named after the artist. */
    private static String uploader(String s) {
        return s.endsWith(" - Topic") ? s.substring(0, s.length() - " - Topic".length()) : s;
    }

    private static String first(String... options) {
        for (String s : options) {
            if (s != null && !s.isBlank()) return s.strip();
        }
        return "";
    }

    private static String text(JsonObject o, String field) {
        JsonElement e = o.get(field);
        return e != null && e.isJsonPrimitive() ? e.getAsString() : "";
    }

    private static void delete(Path dir) {
        try (Stream<Path> files = Files.walk(dir)) {
            files.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
        } catch (IOException e) {
            DownloadsClient.LOG.warn("Couldn't clean up {}", dir, e);
        }
    }

    private static void say(Component message) {
        Minecraft mc = Minecraft.getInstance();
        mc.execute(() -> {
            if (mc.player != null) mc.player.sendSystemMessage(message);
        });
    }

    private static void fail(Component message) {
        say(message.copy().withStyle(ChatFormatting.RED));
    }

    private static void bar(Component message) {
        Minecraft mc = Minecraft.getInstance();
        mc.execute(() -> {
            if (mc.player != null) mc.player.sendOverlayMessage(message);
        });
    }
}
