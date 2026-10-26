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

import mix.cuemymusic.CueConfig;

/**
 * Runs one link at a time on a background thread: yt-dlp downloads the
 * audio of a video, or of every video in a playlist, ffmpeg converts each to
 * Ogg Vorbis, then they move into {@link DownloadPack} and resources reload.
 */
final class Downloader {
    private static final String PROGRESS = "CMMPROGRESS ";
    private static final String DONE = "CMMDONE ";
    /** Longer videos and live streams are skipped. An hour of Ogg is about 50 MB. */
    private static final String FILTER = "!is_live & duration <? 3600";
    /** The most songs taken from one playlist link. */
    static final int MAX_SONGS = 200;

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
        List<DownloadPack.Added> added = new ArrayList<>();
        String[] playlist = {null};
        int failed = 0;
        try {
            tmp = Files.createTempDirectory("cuemymusic-download");
            say(Component.translatable("cuemymusic_downloads.started"));

            // 1. The best audio-only format of each video, as the site serves it.
            List<JsonObject> done = new ArrayList<>();
            List<String> errors = new ArrayList<>();
            String[] shown = {""};
            List<String> tail = new ArrayList<>();
            int code = exec(List.of(
                    tools.ytDlp().toString(),
                    "--format", "bestaudio/best",
                    "--ffmpeg-location", tools.ffmpeg().getParent().toString(),
                    // A video link that's also in a playlist is just the video; a playlist link is the playlist.
                    "--no-playlist", "--playlist-items", "1-" + MAX_SONGS, "--ignore-errors",
                    "--match-filters", FILTER,
                    "--newline", "--progress",
                    "--progress-template", "download:" + PROGRESS
                            + "%(info.playlist_index)s %(info.playlist_count)s %(progress._percent_str)s",
                    "--print", "after_move:" + DONE
                            + "%(.{filepath,id,extractor_key,webpage_url,title,track,artist,creator,uploader,album,playlist_title})j",
                    "--no-simulate", "--no-warnings",
                    "--output", tmp.resolve("%(id)s.%(ext)s").toString(),
                    "--", url), line -> {
                if (line.startsWith(PROGRESS)) {
                    String[] f = line.substring(PROGRESS.length()).strip().split("\\s+");
                    int percent = f.length == 3 ? percent(f[2]) : -1;
                    if (percent < 0) return;
                    boolean many = isNumber(f[0]) && isNumber(f[1]) && !f[1].equals("1");
                    String key = f[0] + " " + percent;
                    if (key.equals(shown[0])) return;
                    shown[0] = key;
                    bar(many ? Component.translatable("cuemymusic_downloads.progress_of", f[0], f[1], percent)
                            : Component.translatable("cuemymusic_downloads.progress", percent));
                } else if (line.startsWith(DONE)) {
                    if (JsonParser.parseString(line.substring(DONE.length())) instanceof JsonObject o) done.add(o);
                } else {
                    if (line.startsWith("ERROR:")) errors.add(line.substring("ERROR:".length()).strip());
                    tail.add(line);
                    if (tail.size() > 40) tail.removeFirst();
                }
            });
            if (cancelled) return;
            failed = errors.size();
            if (done.isEmpty()) {
                if (code == 0) {
                    fail(Component.translatable("cuemymusic_downloads.skipped"));
                } else {
                    DownloadsClient.LOG.warn("yt-dlp exited with {}:\n{}", code, String.join("\n", tail));
                    fail(Component.translatable("cuemymusic_downloads.failed",
                            errors.isEmpty() ? "yt-dlp exited with " + code : errors.getLast()));
                }
                return;
            }
            if (failed > 0) DownloadsClient.LOG.warn("yt-dlp couldn't download {} of the videos:\n{}", failed, String.join("\n", errors));

            // 2. Ogg Vorbis, the only format the game streams, then into the pack.
            for (int i = 0; i < done.size() && !cancelled; i++) {
                JsonObject info = done.get(i);
                if (playlist[0] == null && !text(info, "playlist_title").isBlank()) playlist[0] = text(info, "playlist_title").strip();
                bar(done.size() > 1 ? Component.translatable("cuemymusic_downloads.converting_of", i + 1, done.size())
                        : Component.translatable("cuemymusic_downloads.converting"));
                Path ogg = convert(tools, tmp, Path.of(text(info, "filepath")));
                if (ogg == null) {
                    failed++;
                    continue;
                }
                String title = first(text(info, "track"), text(info, "title"), text(info, "id"));
                String artist = first(text(info, "artist"), text(info, "creator"), uploader(text(info, "uploader")));
                String sourceId = text(info, "extractor_key").toLowerCase(Locale.ROOT) + "_" + text(info, "id");
                added.add(DownloadPack.add(ogg, title, artist, text(info, "album"),
                        first(text(info, "webpage_url"), url), sourceId));
            }
            if (added.isEmpty() && !cancelled) fail(Component.translatable("cuemymusic_downloads.failed", "ffmpeg couldn't convert it"));
        } catch (Exception e) {
            if (!cancelled) {
                DownloadsClient.LOG.warn("Download failed", e);
                fail(Component.translatable("cuemymusic_downloads.failed", String.valueOf(e.getMessage())));
            }
        } finally {
            if (tmp != null) delete(tmp);
            if (cancelled) say(Component.translatable("cuemymusic_downloads.cancelled", added.size()));
            if (!added.isEmpty()) finish(added, playlist[0], failed);
        }
    }

    /** Converts one download to stereo Ogg Vorbis in {@code tmp}. Null if ffmpeg failed. */
    private static Path convert(Tools tools, Path tmp, Path download) throws IOException, InterruptedException {
        if (!Files.isRegularFile(download)) return null;
        Path ogg = tmp.resolve("song.ogg");
        List<String> cmd = new ArrayList<>(List.of(
                tools.ffmpeg().toString(), "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                "-i", download.toString(), "-vn", "-map_metadata", "-1", "-ac", "2"));
        // Homebrew's ffmpeg has no libvorbis; ffmpeg's own encoder is marked experimental but plays fine.
        cmd.addAll(hasLibVorbis(tools) ? List.of("-c:a", "libvorbis", "-q:a", "5")
                : List.of("-c:a", "vorbis", "-strict", "experimental", "-q:a", "6"));
        cmd.add(ogg.toString());
        List<String> out = new ArrayList<>();
        int code = exec(cmd, out::add);
        Files.deleteIfExists(download);
        if (code != 0 || !Files.isRegularFile(ogg)) {
            if (!cancelled) DownloadsClient.LOG.warn("ffmpeg exited with {} on {}:\n{}", code, download, String.join("\n", out));
            return null;
        }
        return ogg;
    }

    /**
     * On the client thread: reload so the player sees the new songs, and for a
     * playlist link, put them in a Cue My Music playlist of the same name.
     */
    private static void finish(List<DownloadPack.Added> added, String playlist, int failed) {
        Minecraft.getInstance().execute(() -> {
            DownloadPack.apply();
            if (playlist == null || added.size() == 1 && failed == 0) {
                DownloadPack.Added a = added.getFirst();
                say(Component.translatable(a.replaced() ? "cuemymusic_downloads.updated" : "cuemymusic_downloads.added",
                        a.song().title()));
            } else {
                String id = Playlists.fill(playlist, added.stream().map(a -> a.song().sound()).toList());
                say(Component.translatable("cuemymusic_downloads.added_playlist", added.size(),
                        CueConfig.INSTANCE.playlist(id).name()));
            }
            if (failed > 0) fail(Component.translatable("cuemymusic_downloads.some_failed", failed));
        });
    }

    private static boolean isNumber(String s) {
        return !s.isEmpty() && s.chars().allMatch(Character::isDigit);
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
