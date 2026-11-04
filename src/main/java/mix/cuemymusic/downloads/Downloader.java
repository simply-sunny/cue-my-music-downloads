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
import java.util.Map;
import java.util.function.Consumer;
import java.util.stream.Stream;

import com.google.gson.JsonArray;
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
    /** The most songs taken from one artist (channel) link. A discography is longer than a playlist. */
    static final int MAX_ARTIST_SONGS = 1000;

    private static Process process;
    private static Thread worker;
    private static volatile boolean cancelled;
    private static String current;

    private Downloader() {
    }

    static synchronized boolean running() {
        return worker != null && worker.isAlive();
    }

    /** The link being downloaded, or null. */
    static synchronized String current() {
        return running() ? current : null;
    }

    /** Starts downloading {@code url}. Returns false if a download is already running. */
    static synchronized boolean start(String url, Tools tools) {
        return start(url, tools, null, null);
    }

    /** What {@link #current} is while picked songs download. */
    static final String PICKED = "picked:";

    /**
     * Starts downloading the songs picked while browsing, under {@code name}
     * ("Picked songs"), each with the title, artists and album YouTube Music
     * shows. Songs already in the pack are skipped. Returns why it can't, or null.
     */
    static Component tryStartPicked(List<Search.Result> songs, String name) {
        if (songs.isEmpty()) return null;
        if (running()) return Component.translatable("cuemymusic_downloads.busy");
        Tools tools = Tools.find();
        if (!tools.ready()) return Component.translatable("cuemymusic_downloads.missing", tools.missing());
        List<Job> jobs = new ArrayList<>();
        for (Search.Result r : songs) jobs.add(new Job(r.url(), r.id(), r.title(), r.artist(), r.album(), r.url()));
        result = null;
        start(PICKED + name, tools, jobs, name);
        return null;
    }

    private static synchronized boolean start(String url, Tools tools, List<Job> picked, String pickedName) {
        if (running()) return false;
        cancelled = false;
        current = url;
        worker = new Thread(() -> run(url, tools, picked, pickedName), "Cue My Music download");
        worker.setDaemon(true);
        worker.start();
        return true;
    }

    /** Stops the running download. Returns false if nothing was running. */
    static synchronized boolean cancel() {
        if (!running()) return false;
        cancelled = true;
        Confirm.cancel();
        if (process != null) {
            process.descendants().forEach(ProcessHandle::destroy);
            process.destroy();
        }
        return true;
    }

    private static void run(String url, Tools tools, List<Job> picked, String pickedName) {
        boolean spotify = picked == null && isSpotify(url);
        boolean channel = picked == null && !spotify && isArtist(url);
        Path tmp = null;
        List<DownloadPack.Added> added = new ArrayList<>();
        String[] artistName = {null};
        String[] playlist = {null};
        int[] failed = {0};
        int[] seen = {0};
        int resolutionFailed = 0;
        List<String> errors = new ArrayList<>();
        List<String> tail = new ArrayList<>();
        String[] shown = {""};
        try {
            tmp = Files.createTempDirectory("cuemymusic-download");
            Path work = tmp;
            say(Component.translatable("cuemymusic_downloads.started"));
            bar(Component.translatable("cuemymusic_downloads.starting"), -1);
            int[] already = {0};
            int[] dupes = {0};

            Map<String, Job> jobs = Map.of();
            int total = 0;
            if (picked != null) {
                // Songs already in the pack are skipped, so picking one again does nothing.
                java.util.Set<String> have = new java.util.HashSet<>();
                for (DownloadPack.Song s : DownloadPack.songs()) {
                    if (s.sourceId().startsWith("youtube_")) have.add(s.sourceId().substring("youtube_".length()));
                }
                Map<String, Job> fresh = new java.util.LinkedHashMap<>();
                for (Job job : picked) {
                    if (!have.contains(job.id())) fresh.putIfAbsent(job.id(), job);
                }
                if (fresh.isEmpty()) {
                    say(Component.translatable("cuemymusic_downloads.nothing_new"));
                    return;
                }
                jobs = fresh;
                total = jobs.size();
                playlist[0] = fresh.size() > 1 ? pickedName : null;
            } else if (spotify) {
                Resolved resolved = resolveSpotify(url, tools, work);
                if (cancelled || resolved == null) return;
                resolutionFailed = resolved.failed();
                // Songs already in the pack are skipped, so downloading a playlist
                // again only fetches what's new.
                java.util.Set<String> have = new java.util.HashSet<>();
                for (DownloadPack.Song s : DownloadPack.songs()) {
                    if (s.sourceId().startsWith("youtube_")) have.add(s.sourceId().substring("youtube_".length()));
                }
                Map<String, Job> fresh = new java.util.LinkedHashMap<>();
                for (Job job : resolved.jobs()) {
                    if (!have.contains(job.id())) fresh.putIfAbsent(job.id(), job);
                }
                if (fresh.isEmpty()) {
                    if (resolutionFailed > 0) {
                        fail(Component.translatable("cuemymusic_downloads.some_failed", resolutionFailed));
                    } else if (resolved.skipped() > 0) {
                        say(Component.translatable("cuemymusic_downloads.spotify.nothing_kept", resolved.skipped()));
                    } else {
                        say(Component.translatable("cuemymusic_downloads.nothing_new"));
                    }
                    return;
                }
                jobs = fresh;
                total = jobs.size();
                playlist[0] = resolved.playlist();
                artistName[0] = resolved.artist();
            }

            // 1. The best audio-only format of each video, as the site serves it.
            //    Each song is converted as soon as it arrives, so a long artist
            //    or playlist download doesn't fill the disk, and cancelling keeps
            //    what finished.
            List<String> cmd = new ArrayList<>(List.of(
                    tools.ytDlp().toString(),
                    "--format", "bestaudio/best",
                    "--ffmpeg-location", tools.ffmpeg().getParent().toString(),
                    // A video link that's also in a playlist is just the video; a playlist or artist link is the whole thing.
                    "--no-playlist", "--playlist-items", "1-" + (channel ? MAX_ARTIST_SONGS : MAX_SONGS),
                    "--ignore-errors",
                    "--match-filters", FILTER,
                    "--newline", "--progress",
                    "--progress-template", "download:" + PROGRESS
                            + "%(info.playlist_index)s %(info.playlist_count)s %(progress._percent_str)s",
                    "--print", "after_move:" + DONE
                            + "%(.{filepath,id,extractor_key,webpage_url,title,track,artist,creator,uploader,album,playlist_title,playlist_index,playlist_count})j",
                    "--no-simulate", "--no-warnings",
                    "--output", tmp.resolve("%(id)s.%(ext)s").toString()));
            if (channel) {
                // Songs already in the pack are skipped, so downloading an artist
                // again only fetches what's new. The archive lives for this run
                // only: a song downloaded on its own is still replaced.
                Path archive = tmp.resolve("downloaded.txt");
                List<String> have = new ArrayList<>();
                for (DownloadPack.Song s : DownloadPack.songs()) {
                    if (s.sourceId().startsWith("youtube_")) {
                        have.add("youtube " + s.sourceId().substring("youtube_".length()));
                    }
                }
                Files.write(archive, have, StandardCharsets.UTF_8);
                cmd.addAll(List.of("--download-archive", archive.toString()));
            }
            if (spotify || picked != null) {
                Path list = tmp.resolve("jobs.txt");
                Files.write(list, jobs.values().stream().map(Job::url).toList(), StandardCharsets.UTF_8);
                cmd.addAll(List.of("--batch-file", list.toString()));
            } else {
                cmd.addAll(List.of("--", url));
            }

            int songs = total;
            Map<String, Job> matched = jobs;
            // An artist's songs come round again on singles, albums and
            // compilations, each a different video: one of each is enough.
            java.util.Set<String> had = channel ? songsHad() : null;
            int code = exec(cmd, line -> {
                if (line.startsWith(PROGRESS)) {
                    String[] f = line.substring(PROGRESS.length()).strip().split("\\s+");
                    int percent = f.length == 3 ? percent(f[2]) : -1;
                    if (percent < 0) return;
                    if (songs > 0) {
                        int n = Math.min(songs, added.size() + failed[0] + 1);
                        bar(Component.translatable("cuemymusic_downloads.progress_of", n, songs, percent),
                                (n - 1 + percent / 100.0) / songs);
                        return;
                    }
                    boolean many = isNumber(f[0]) && isNumber(f[1]) && !f[1].equals("1");
                    String key = f[0] + " " + percent;
                    if (key.equals(shown[0])) return;
                    shown[0] = key;
                    double fraction = many ? (Integer.parseInt(f[0]) - 1 + percent / 100.0) / Integer.parseInt(f[1]) : percent / 100.0;
                    bar(many ? Component.translatable("cuemymusic_downloads.progress_of", f[0], f[1], percent)
                            : Component.translatable("cuemymusic_downloads.progress", percent), fraction);
                } else if (line.startsWith(DONE)) {
                    if (JsonParser.parseString(line.substring(DONE.length())) instanceof JsonObject o) {
                        seen[0]++;
                        if (channel && artistName[0] == null) {
                            artistName[0] = first(text(o, "artist"), text(o, "creator"),
                                    uploader(text(o, "uploader")), url);
                        }
                        if (!channel && !spotify && playlist[0] == null && !text(o, "playlist_title").isBlank()) {
                            playlist[0] = text(o, "playlist_title").strip();
                        }
                        if (!save(tools, work, o, url, added, failed, songs, matched, had)) dupes[0]++;
                    }
                } else {
                    if (line.startsWith("ERROR:")) errors.add(line.substring("ERROR:".length()).strip());
                    else if (line.contains("has already been recorded in the archive")) already[0]++;
                    tail.add(line);
                    if (tail.size() > 40) tail.removeFirst();
                }
            }, true);
            if (cancelled) return;
            if (added.isEmpty()) {
                if (seen[0] > dupes[0]) {
                    fail(Component.translatable("cuemymusic_downloads.failed", "ffmpeg couldn't convert it"));
                } else if (code != 0 && !errors.isEmpty()) {
                    DownloadsClient.LOG.warn("yt-dlp exited with {}:\n{}", code, String.join("\n", tail));
                    fail(Component.translatable("cuemymusic_downloads.failed", errors.getLast()));
                } else if (already[0] + dupes[0] > 0) {
                    say(Component.translatable("cuemymusic_downloads.nothing_new"));
                } else if (code == 0) {
                    fail(Component.translatable("cuemymusic_downloads.skipped"));
                } else {
                    DownloadsClient.LOG.warn("yt-dlp exited with {}:\n{}", code, String.join("\n", tail));
                    fail(Component.translatable("cuemymusic_downloads.failed", "yt-dlp exited with " + code));
                }
                return;
            }
            if (!errors.isEmpty()) DownloadsClient.LOG.warn("yt-dlp couldn't download {} of the videos:\n{}", errors.size(), String.join("\n", errors));
        } catch (Exception e) {
            if (!cancelled) {
                DownloadsClient.LOG.warn("Download failed", e);
                fail(Component.translatable("cuemymusic_downloads.failed", String.valueOf(e.getMessage())));
            }
        } finally {
            if (tmp != null) delete(tmp);
            if (cancelled) say(Component.translatable("cuemymusic_downloads.cancelled", added.size()));
            if (!added.isEmpty()) {
                finish(added, artistName[0], playlist[0], failed[0] + errors.size() + resolutionFailed);
            }
        }
    }

    /** One Spotify track to download, with the metadata Spotify has and the YouTube video that was matched to it. */
    private record Job(String url, String id, String title, String artist, String album, String source) {
    }

    /** What resolving a Spotify link found: songs to download, matches that were skipped, and what to call the playlist. */
    private record Resolved(List<Job> jobs, int failed, int skipped, String playlist, String artist) {
    }

    /**
     * Reads a Spotify playlist, album, artist or track with spotdl, then finds a
     * YouTube Music match for each song. Matches that aren't clear are shown to
     * the player to keep or skip.
     */
    private static Resolved resolveSpotify(String url, Tools tools, Path tmp) throws Exception {
        bar(Component.translatable("cuemymusic_downloads.spotify.reading"), -1);
        Path file = tmp.resolve("spotify.spotdl");
        List<String> log = new ArrayList<>();
        int code = exec(List.of(tools.spotdl().toString(), "save", url,
                "--save-file", file.toString(), "--log-level", "ERROR", "--threads", "4"), line -> {
                    log.add(line);
                    if (log.size() > 30) log.removeFirst();
                }, true);
        if (cancelled) return null;
        if (code != 0 || !Files.isRegularFile(file)) {
            DownloadsClient.LOG.warn("spotdl exited with {}:\n{}", code, String.join("\n", log));
            throw new IOException("spotdl exited with " + code);
        }
        JsonElement parsed = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8));
        if (!(parsed instanceof JsonArray tracks)) throw new IOException("spotdl returned no songs");

        String type = spotifyType(url);
        String playlist = null, artist = null;
        if ("playlist".equals(type) || "album".equals(type)) {
            String name = firstTrack(tracks, "list_name", "album_name");
            playlist = name.isBlank() ? null : name;
        } else if ("artist".equals(type)) {
            artist = firstTrack(tracks, "artist");
        }

        List<Job> jobs = new ArrayList<>();
        java.util.Set<String> ids = new java.util.HashSet<>();
        java.util.Set<String> had = songsHad();
        int failed = 0, skipped = 0, n = 0;
        boolean skipAll = false;
        boolean told = false;
        // The same limits as a YouTube link: a playlist is a playlist, and an
        // artist's discography is longer.
        int limit = "artist".equals(type) ? MAX_ARTIST_SONGS : MAX_SONGS;
        int count = Math.min(tracks.size(), limit);
        if (tracks.size() > limit) {
            DownloadsClient.LOG.info("The Spotify link has {} songs; taking the first {}.", tracks.size(), limit);
        }
        for (JsonElement element : tracks) {
            if (cancelled) return null;
            if (!(element instanceof JsonObject o)) continue;
            n++;
            if (n > limit) break;
            String title = text(o, "name"), by = text(o, "artist");
            int seconds = (int) number(o, "duration");
            if (title.isBlank() || by.isBlank()) {
                failed++;
                continue;
            }
            // The same song on a single and its album: one is enough, and one already downloaded is kept.
            if (!had.add(songKey(title, by))) continue;
            bar(Component.translatable("cuemymusic_downloads.spotify.matching", n, count),
                    (n - 1) / (double) Math.max(1, count));
            Search.Result match = best(title, by, seconds);
            if (match == null) {
                DownloadsClient.LOG.warn("Couldn't find a YouTube match for {} - {}", by, title);
                failed++;
                continue;
            }
            if (!ids.add(match.id())) continue;
            if (!sure(title, by, seconds, match.title(), match.artist(), match.seconds())) {
                if (skipAll) {
                    skipped++;
                    continue;
                }
                bar(Component.translatable("cuemymusic_downloads.spotify.waiting"), -1);
                if (!told) {
                    told = true;
                    say(Component.translatable("cuemymusic_downloads.spotify.check", by, title));
                }
                Confirm.Decision decision = Confirm.ask(new Confirm.Match(title, by, seconds, match.title(), match.artist(),
                        Double.isNaN(match.seconds()) ? -1 : (int) match.seconds(), match.url()));
                if (cancelled) return null;
                if (decision == Confirm.Decision.SKIP || decision == Confirm.Decision.SKIP_ALL) {
                    skipped++;
                    skipAll |= decision == Confirm.Decision.SKIP_ALL;
                    continue;
                }
            }
            jobs.add(new Job(match.url(), match.id(), title, by, text(o, "album_name"), text(o, "url")));
        }
        return new Resolved(jobs, failed, skipped, playlist, artist);
    }

    /** The first non-empty one of these fields in any track. */
    private static String firstTrack(JsonArray tracks, String... fields) {
        for (JsonElement e : tracks) {
            if (!(e instanceof JsonObject o)) continue;
            for (String field : fields) {
                String value = text(o, field);
                if (!value.isBlank()) return value;
            }
        }
        return "";
    }

    /** The YouTube Music result that looks most like this Spotify track, or null if nothing was found. */
    private static Search.Result best(String title, String artist, int seconds) {
        for (int attempt = 1; ; attempt++) {
            try {
                Search.Result best = null;
                int bestScore = -1;
                for (Search.Result r : Search.query(artist + " " + title)) {
                    int score = score(title, artist, seconds, r);
                    if (score > bestScore) {
                        bestScore = score;
                        best = r;
                    }
                }
                return best;
            } catch (Exception e) {
                // YouTube Music rate-limits a long playlist's worth of searches,
                // so a failed search is usually worth trying again.
                DownloadsClient.LOG.warn("Couldn't match {} - {} (try {})", artist, title, attempt, e);
                if (cancelled || attempt >= 3) return null;
                try {
                    Thread.sleep(1500L * attempt);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return null;
                }
            }
        }
    }

    /** 0 to 6: the title, artist and length each match or don't. */
    private static int score(String title, String artist, int seconds, Search.Result r) {
        int score = 0;
        if (titleMatches(title, r.title())) score += 2;
        if (artistMatches(artist, r.artist())) score += 2;
        double length = r.seconds();
        if (seconds > 0 && !Double.isNaN(length)) {
            double difference = Math.abs(seconds - length);
            if (difference <= 5) score += 2;
            else if (difference <= 15) score += 1;
        }
        return score;
    }

    /** True when a match is close enough to download without asking. */
    private static boolean sure(String title, String artist, int seconds, String youtubeTitle, String youtubeArtist, double youtubeSeconds) {
        return titleMatches(title, youtubeTitle) && artistMatches(artist, youtubeArtist)
                && seconds > 0 && !Double.isNaN(youtubeSeconds) && Math.abs(seconds - youtubeSeconds) <= 20;
    }

    /** Words that describe the upload, not the song: a title with or without them is the same song. */
    private static final java.util.Set<String> TITLE_NOISE = java.util.Set.of(
            "official", "video", "audio", "lyric", "lyrics", "visualizer", "visualiser", "music", "hd", "hq", "4k",
            "explicit", "clean", "remaster", "remastered", "topic");

    /**
     * Whether the YouTube title names this song. Words in the Spotify title all
     * have to be there; extra words in the YouTube title ("Official Video") are
     * fine. A qualifier in brackets or after a dash ("Remix", "Live") has to
     * match too, so a remix isn't taken for the original.
     */
    private static boolean titleMatches(String spotify, String youtube) {
        if (spotify.isBlank() || youtube.isBlank()) return false;
        String core = spotify.replaceAll("\\s*[\\[(].*$", "").replaceAll(
                "(?i)\\s+-\\s+(?:\\d{4}\\s+)?(?:remaster(?:ed)?|digital remaster|mono|stereo|single version|album version|radio edit|deluxe).*$", "");
        java.util.Set<String> want = words(core), have = words(youtube);
        if (want.isEmpty() || have.isEmpty()) return false;
        int found = 0;
        for (String word : want) if (have.contains(word)) found++;
        if (found < Math.ceil(want.size() * 0.8)) return false;

        String tail = spotify.substring(core.length());
        if (!tail.isBlank() && !tail.toLowerCase(Locale.ROOT).matches("^\\s*[\\[(]\\s*(feat|ft|featuring|with|prod)\\b.*")) {
            for (String word : words(tail)) {
                if (word.chars().allMatch(Character::isDigit)) continue;
                if (!have.contains(word)) return false;
            }
        }
        return true;
    }

    /** True when the Spotify artist is named in the YouTube artist, channel or title ("Kesha" in "KeshaVEVO"). */
    private static boolean artistMatches(String spotify, String youtube) {
        String a = squash(spotify), b = squash(youtube);
        return a.length() >= 3 && b.contains(a);
    }

    private static String squash(String s) {
        return s.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", "");
    }

    /** {@link #songKey} of each song in the pack. */
    private static java.util.Set<String> songsHad() {
        java.util.Set<String> had = new java.util.HashSet<>();
        for (DownloadPack.Song s : DownloadPack.songs()) had.add(songKey(s.title(), s.artist()));
        return had;
    }

    /**
     * The same for two copies of one song: its title's words without upload
     * noise, a featured artist or a "- Remastered" tail, and its main artist.
     * A remix or live take keeps its qualifier, so it stays a song of its own.
     */
    static String songKey(String title, String artist) {
        String t = title.replaceAll("(?i)\\s*[\\[(]\\s*(feat|ft|featuring|with|prod)\\b[^\\])]*[\\])]?", "")
                .replaceAll("(?i)\\s+-\\s+(?:\\d{4}\\s+)?(?:remaster(?:ed)?|digital remaster|single version|album version|radio edit).*$", "");
        String main = artist.split("(?i)\\s*(?:,|&|\\bfeat\\.?|\\bft\\.?|\\bx\\b)\\s*")[0];
        return String.join(" ", new java.util.TreeSet<>(words(t))) + "|" + String.join(" ", new java.util.TreeSet<>(words(main)));
    }

    private static java.util.Set<String> words(String s) {
        java.util.Set<String> out = new java.util.HashSet<>();
        for (String word : s.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+")) {
            if (!word.isBlank() && !TITLE_NOISE.contains(word)) out.add(word);
        }
        return out;
    }

    /**
     * Converts one finished download and moves it into the pack. A song that
     * can't be converted, or saved, counts in {@code failed}. With {@code had},
     * a song already in it is dropped unconverted and this returns false.
     */
    private static boolean save(Tools tools, Path tmp, JsonObject info, String url,
            List<DownloadPack.Added> added, int[] failed, int total, Map<String, Job> jobs, java.util.Set<String> had) {
        String id = text(info, "id");
        try {
            if (had != null && !had.add(songKey(first(text(info, "track"), text(info, "title"), id),
                    first(text(info, "artist"), text(info, "creator"), uploader(text(info, "uploader")))))) {
                Files.deleteIfExists(Path.of(text(info, "filepath")));
                return false;
            }
            int index = (int) number(info, "playlist_index");
            int count = (int) number(info, "playlist_count");
            if (total > 0) {
                int n = Math.min(total, added.size() + failed[0] + 1);
                bar(Component.translatable("cuemymusic_downloads.converting_of", n, total), (n - 1) / (double) total);
            } else if (count > 1) {
                bar(Component.translatable("cuemymusic_downloads.converting_of",
                        index > 0 ? index : added.size() + failed[0] + 1, count),
                        (Math.max(index, 1) - 1) / (double) count);
            } else {
                bar(Component.translatable("cuemymusic_downloads.converting"), -1);
            }
            Path ogg = convert(tools, tmp, Path.of(text(info, "filepath")));
            if (ogg == null) {
                failed[0]++;
                return true;
            }
            Job job = jobs.get(id);
            String title, artist, album, source;
            if (job != null) {
                title = job.title();
                artist = job.artist();
                album = job.album();
                source = job.source();
            } else {
                title = first(text(info, "track"), text(info, "title"), id);
                artist = first(text(info, "artist"), text(info, "creator"), uploader(text(info, "uploader")));
                album = text(info, "album");
                source = first(text(info, "webpage_url"), url);
            }
            String sourceId = text(info, "extractor_key").toLowerCase(Locale.ROOT) + "_" + id;
            added.add(DownloadPack.add(ogg, title, artist, album, source, sourceId));
        } catch (Exception e) {
            failed[0]++;
            DownloadsClient.LOG.warn("Couldn't save {}", id, e);
        }
        return true;
    }

    /** Converts one download to stereo Ogg Vorbis in {@code tmp}. Null if ffmpeg failed. */
    private static Path convert(Tools tools, Path tmp, Path download) throws IOException, InterruptedException {
        if (!Files.isRegularFile(download)) return null;
        Path ogg = tmp.resolve("song.ogg");
        List<String> decode = new ArrayList<>(List.of(
                tools.ffmpeg().toString(), "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                "-i", download.toString(), "-vn", "-map_metadata", "-1", "-ac", "2"));
        List<String> out = new ArrayList<>();
        int code;
        String tool;
        if (hasLibVorbis(tools)) {
            tool = "ffmpeg";
            decode.addAll(List.of("-c:a", "libvorbis", "-q:a", QUALITY, ogg.toString()));
            code = exec(decode, out::add, false);
        } else if (tools.oggenc() != null) {
            // ffmpeg decodes to WAV, oggenc encodes it with libvorbis.
            Path wav = tmp.resolve("song.wav");
            decode.addAll(List.of("-c:a", "pcm_s16le", wav.toString()));
            tool = "ffmpeg";
            code = exec(decode, out::add, false);
            if (code == 0) {
                tool = "oggenc";
                code = exec(List.of(tools.oggenc().toString(), "--quiet", "-q", QUALITY, "-o", ogg.toString(), wav.toString()),
                        out::add, false);
            }
            Files.deleteIfExists(wav);
        } else {
            // ffmpeg's own Vorbis encoder: it plays, but it sounds noticeably worse. The Downloads page says so.
            tool = "ffmpeg";
            decode.addAll(List.of("-c:a", "vorbis", "-strict", "experimental", "-q:a", "10", ogg.toString()));
            code = exec(decode, out::add, false);
        }
        Files.deleteIfExists(download);
        if (code != 0 || !Files.isRegularFile(ogg)) {
            if (!cancelled) DownloadsClient.LOG.warn("{} exited with {} on {}:\n{}", tool, code, download, String.join("\n", out));
            return null;
        }
        return ogg;
    }

    /**
     * On the client thread: reload so the player sees the new songs, and for a
     * playlist link, put them in a Cue My Music playlist of the same name.
     * Artist links don't make a playlist: Cue My Music already has an artist
     * page for their songs.
     */
    private static void finish(List<DownloadPack.Added> added, String artist, String playlist, int failed) {
        Minecraft.getInstance().execute(() -> {
            DownloadPack.apply();
            DownloadPack.fillCovers();
            if (artist != null) {
                if (added.size() == 1 && failed == 0) {
                    DownloadPack.Added a = added.getFirst();
                    say(Component.translatable(a.replaced() ? "cuemymusic_downloads.updated" : "cuemymusic_downloads.added",
                            a.song().title()));
                } else {
                    say(Component.translatable("cuemymusic_downloads.added_artist", added.size(), artist));
                }
            } else if (playlist == null || added.size() == 1 && failed == 0) {
                DownloadPack.Added a = added.getFirst();
                say(Component.translatable(a.replaced() ? "cuemymusic_downloads.updated" : "cuemymusic_downloads.added",
                        a.song().title()));
            } else {
                String id = Playlists.fill(playlist, added.stream().map(a -> a.song().sound()).toList());
                say(Component.translatable("cuemymusic_downloads.added_playlist", added.size(),
                        CueConfig.INSTANCE.playlist(id).name()));
            }
            if (failed > 0) fail(Component.translatable("cuemymusic_downloads.some_failed", failed));
            // Downloads are add-on songs: only Add-ons plays them.
            if (!added.isEmpty() && !"addons".equals(mix.cuemymusic.Modes.current())) {
                say(Component.translatable("cuemymusic_downloads.switch_mode"));
            }
        });
    }

    private static boolean isNumber(String s) {
        return !s.isEmpty() && s.chars().allMatch(Character::isDigit);
    }

    /**
     * Runs a tool, passing each line it prints to {@code lines}. Returns its
     * exit code, or -1 if cancelled first. Only the download itself is
     * {@code tracked}: Cancel stops it, while a conversion already running is
     * left to finish.
     */
    private static int exec(List<String> cmd, Consumer<String> lines, boolean tracked) throws IOException, InterruptedException {
        Process p;
        synchronized (Downloader.class) {
            if (cancelled) return -1;
            p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
            if (tracked) process = p;
        }
        try (BufferedReader out = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = out.readLine()) != null) lines.accept(line);
        } finally {
            if (tracked) {
                synchronized (Downloader.class) {
                    process = null;
                }
            }
        }
        return p.waitFor();
    }

    /**
     * libvorbis's top quality, about 400 kbps. The source is already lossy (YouTube's Opus is about 130 kbps),
     * and each lossy step costs something, so this step should cost as little as it can: measured on a song,
     * q10 is 38.5 dB from the source, q7 only 29.8 dB. A 5-minute song is about 15 MB.
     */
    private static final String QUALITY = "10";
    private static final Object ENCODER_CHECK = new Object();
    private static Boolean libVorbis;
    private static Path libVorbisFor;

    /** True if songs will be made with ffmpeg's weaker built-in encoder, because there's no libvorbis or oggenc. */
    static boolean lowQuality(Tools tools) {
        if (tools.oggenc() != null || tools.ffmpeg() == null) return false;
        try {
            return !hasLibVorbis(tools);
        } catch (Exception e) {
            return true;
        }
    }

    /**
     * Whether this ffmpeg has libvorbis, checked once per ffmpeg. Runs its own
     * process, not through {@link #exec}, so it never touches the download that
     * Cancel stops.
     */
    private static boolean hasLibVorbis(Tools tools) throws IOException, InterruptedException {
        synchronized (ENCODER_CHECK) {
            if (libVorbis == null || !tools.ffmpeg().equals(libVorbisFor)) {
                Process p = new ProcessBuilder(tools.ffmpeg().toString(), "-hide_banner", "-encoders").redirectErrorStream(true).start();
                boolean found = false;
                try (BufferedReader out = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = out.readLine()) != null) found |= line.contains(" libvorbis ");
                }
                p.waitFor();
                libVorbis = found;
                libVorbisFor = tools.ffmpeg();
            }
            return libVorbis;
        }
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

    /** A numeric field, or -1 if it's missing. */
    private static double number(JsonObject o, String field) {
        JsonElement e = o.get(field);
        return e != null && e.isJsonPrimitive() && e.getAsJsonPrimitive().isNumber() ? e.getAsDouble() : -1;
    }

    /**
     * True for a link to a YouTube channel or artist page rather than one video
     * or playlist: {@code @handle}, {@code /channel/}, {@code /c/},
     * {@code /user/}, and YouTube Music's {@code /browse/UC...}.
     */
    static boolean isArtist(String url) {
        String u = url.strip().toLowerCase(Locale.ROOT);
        if (!u.matches("https?://(www\\.|m\\.)?youtube\\.com/.*") && !u.matches("https?://music\\.youtube\\.com/.*")) return false;
        String path = u.substring(u.indexOf('/', u.indexOf("//") + 2));
        return path.startsWith("/@") || path.startsWith("/channel/") || path.startsWith("/c/")
                || path.startsWith("/user/") || path.startsWith("/browse/uc");
    }

    /** True for a Spotify song, album, playlist or artist link, which spotdl handles. */
    static boolean isSpotify(String url) {
        return spotifyType(url) != null;
    }

    /** "track", "album", "playlist" or "artist", or null for other Spotify links. */
    private static String spotifyType(String url) {
        var matcher = java.util.regex.Pattern
                .compile("https?://([a-z0-9-]+\\.)?spotify\\.com/(?:intl-[a-z-]+/)?(track|album|playlist|artist)/")
                .matcher(url.strip().toLowerCase(Locale.ROOT));
        return matcher.find() ? matcher.group(2) : null;
    }

    private static void delete(Path dir) {
        try (Stream<Path> files = Files.walk(dir)) {
            files.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
        } catch (IOException e) {
            DownloadsClient.LOG.warn("Couldn't clean up {}", dir, e);
        }
    }

    /** What the running download is doing, for the Downloads page. Fraction is -1 when unknown. */
    record Status(Component label, double fraction) {
    }

    /** The last message about a download, for the Downloads page, and whether it was a failure. */
    record Result(Component message, boolean failed) {
    }

    private static volatile Status status = new Status(Component.empty(), -1);
    private static volatile Result result;

    static Status status() {
        return status;
    }

    static Result result() {
        return result;
    }

    /** Shows a message about a download or a removal on the Downloads page. */
    static void report(Component message, boolean failed) {
        result = new Result(message, failed);
    }

    private static void say(Component message) {
        report(message, false);
        Minecraft mc = Minecraft.getInstance();
        mc.execute(() -> {
            if (mc.player != null) mc.player.sendSystemMessage(message);
        });
    }

    private static void fail(Component message) {
        report(message, true);
        Minecraft mc = Minecraft.getInstance();
        mc.execute(() -> {
            if (mc.player != null) mc.player.sendSystemMessage(message.copy().withStyle(ChatFormatting.RED));
        });
    }

    private static void bar(Component message, double fraction) {
        status = new Status(message, fraction);
        Minecraft mc = Minecraft.getInstance();
        mc.execute(() -> {
            if (mc.player != null) mc.player.sendOverlayMessage(message);
        });
    }

    /**
     * Starts downloading {@code link}, after checking it and the tools.
     * Returns why it can't, or null once it's started. Shared by the command
     * and the Downloads page.
     */
    static Component tryStart(String link) {
        link = link.strip();
        String lower = link.toLowerCase(Locale.ROOT);
        if (!lower.startsWith("https://") && !lower.startsWith("http://") || link.contains(" ")) {
            return Component.translatable("cuemymusic_downloads.not_link");
        }
        boolean spotify = isSpotify(link);
        if (!spotify && lower.matches("https?://([a-z0-9-]+\\.)?spotify\\.com/.*")) {
            return Component.translatable("cuemymusic_downloads.spotify_unsupported");
        }
        if (running()) return Component.translatable("cuemymusic_downloads.busy");
        Tools tools = Tools.find();
        if (!tools.ready()) return Component.translatable("cuemymusic_downloads.missing", tools.missing());
        if (spotify && tools.spotdl() == null) {
            return Component.translatable("cuemymusic_downloads.spotify_missing", Tools.spotdlHint());
        }
        result = null;
        start(link, tools);
        return null;
    }
}
