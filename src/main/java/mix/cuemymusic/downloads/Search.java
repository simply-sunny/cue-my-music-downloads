package mix.cuemymusic.downloads;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * Searches for songs by name on a background thread, for the Downloads page.
 * YouTube Music's song search comes first: it finds the songs themselves,
 * with artist, album, length and cover art. If that fails, yt-dlp searches
 * YouTube instead. Only the newest search's results are kept.
 */
final class Search {
    /** How many results a search shows. */
    static final int RESULTS = 10;
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8)).followRedirects(HttpClient.Redirect.NORMAL).build();
    /** YouTube Music's search endpoint, and the filter for its Songs tab. */
    private static final String YTM_SEARCH = "https://music.youtube.com/youtubei/v1/search?prettyPrint=false";
    private static final String SONGS_ONLY = "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D";

    /**
     * One song found: its video id, title, artist, album (may be empty), length
     * in seconds (NaN if unknown), plays as YouTube Music shows them ("287M
     * plays"; may be empty), cover art link (may be empty), and the link to download.
     */
    record Result(String id, String title, String artist, String album, double seconds, String plays, String art, String url) {
        /** The id the download pack keeps for it, to tell if it's already downloaded. */
        String sourceId() {
            return "youtube_" + id;
        }
    }

    /** What the page shows: the query, whether it's still running, and the results or why there are none. */
    record State(String query, boolean running, List<Result> results, String error) {
    }

    private static volatile State state;
    private static long generation;
    private static Process process;

    private Search() {
    }

    static State state() {
        return state;
    }

    static synchronized void clear() {
        generation++;
        stopProcess();
        state = null;
    }

    /** Starts searching for {@code query}, replacing any search still running. */
    static synchronized void start(String query, Tools tools) {
        long mine = ++generation;
        stopProcess();
        state = new State(query, true, List.of(), null);
        Thread t = new Thread(() -> run(mine, query, tools), "Cue My Music search");
        t.setDaemon(true);
        t.start();
    }

    private static void run(long mine, String query, Tools tools) {
        List<Result> results = List.of();
        String error = null;
        try {
            results = youTubeMusic(query);
        } catch (Exception e) {
            DownloadsClient.LOG.warn("YouTube Music search for {} failed, trying yt-dlp", query, e);
        }
        if (results.isEmpty() && tools != null) {
            try {
                results = ytDlp(mine, query, tools);
            } catch (Exception e) {
                DownloadsClient.LOG.warn("Search for {} failed", query, e);
                error = String.valueOf(e.getMessage());
            }
        }
        results = officialFirst(results, query);
        synchronized (Search.class) {
            if (mine != generation) return;
            process = null;
            state = new State(query, false, List.copyOf(results), results.isEmpty() ? error : null);
        }
    }

    /** Words in a title that mark a re-upload or an edit rather than the song itself. */
    private static final List<String> UNOFFICIAL = List.of("slowed", "sped up", "speed up", "reverb", "nightcore", "8d", "lyric", "lyrics",
            "cover", "karaoke", "instrumental", "remix", "bass boosted", "tiktok", "1 hour", "loop", "mashup", "live", "edit",
            "fan made", "audio only", "hq", "extended");

    /**
     * The results with official songs first: a title marked as an edit or a
     * re-upload (slowed, lyrics, cover...) moves down, unless the search asked
     * for it. Then songs whose title and artist hold more of the search's
     * words, so "minecraft c418" puts C418's Minecraft above a cover named
     * Minecraft. Otherwise the search's own order stays.
     */
    static List<Result> officialFirst(List<Result> results, String query) {
        String q = query.toLowerCase(java.util.Locale.ROOT);
        String[] words = q.split("\\s+");
        java.util.Map<Result, Integer> unofficial = new java.util.HashMap<>(), missing = new java.util.HashMap<>();
        for (Result r : results) {
            String t = (r.title() + " " + r.album()).toLowerCase(java.util.Locale.ROOT);
            String a = r.artist().toLowerCase(java.util.Locale.ROOT);
            int n = 0;
            for (String w : UNOFFICIAL) {
                if (!q.contains(w) && word(w).matcher(t).find()) n++;
            }
            // A plain YouTube video (from the fallback search, so no album) ranks below an official one.
            if (r.album().isEmpty() && !(a.contains("vevo") || t.contains("official"))) n++;
            unofficial.put(r, n);
            String said = (r.title() + " " + r.artist()).toLowerCase(java.util.Locale.ROOT);
            int m = 0;
            for (String w : words) {
                if (!w.isEmpty() && !word(w).matcher(said).find()) m++;
            }
            missing.put(r, m);
        }
        return results.stream().sorted(java.util.Comparator.<Result>comparingInt(unofficial::get).thenComparingInt(missing::get)).toList();
    }

    private static java.util.regex.Pattern word(String w) {
        return java.util.regex.Pattern.compile("(?<![\\p{L}\\p{N}])" + java.util.regex.Pattern.quote(w) + "(?![\\p{L}\\p{N}])");
    }

    // ---------------------------------------------------------------- YouTube Music

    private static List<Result> youTubeMusic(String query) throws Exception {
        JsonObject body = new JsonObject();
        JsonObject client = new JsonObject();
        client.addProperty("clientName", "WEB_REMIX");
        client.addProperty("clientVersion", "1.20241023.01.00");
        client.addProperty("hl", "en");
        JsonObject context = new JsonObject();
        context.add("client", client);
        body.add("context", context);
        body.addProperty("query", query);
        body.addProperty("params", SONGS_ONLY);
        HttpRequest request = HttpRequest.newBuilder(URI.create(YTM_SEARCH))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .header("Origin", "https://music.youtube.com")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString())).build();
        HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new IllegalStateException("HTTP " + response.statusCode());
        List<Result> results = new ArrayList<>();
        collect(JsonParser.parseString(response.body()), results);
        return results;
    }

    /** Finds each song row in the response, wherever it is. */
    private static void collect(JsonElement e, List<Result> out) {
        if (out.size() >= RESULTS) return;
        if (e instanceof JsonObject o) {
            if (o.get("musicResponsiveListItemRenderer") instanceof JsonObject row) {
                Result r = row(row);
                if (r != null) out.add(r);
                return;
            }
            for (var entry : o.entrySet()) collect(entry.getValue(), out);
        } else if (e instanceof JsonArray a) {
            for (JsonElement x : a) collect(x, out);
        }
    }

    /** A row's columns: the title, then "Artist • Album • 3:40", then "287M plays". */
    private static Result row(JsonObject row) {
        String id = string(path(row, "playlistItemData", "videoId"));
        if (id.isEmpty()) return null;
        List<String> columns = new ArrayList<>();
        if (row.get("flexColumns") instanceof JsonArray cols) {
            for (JsonElement c : cols) {
                StringBuilder text = new StringBuilder();
                if (path(c, "musicResponsiveListItemFlexColumnRenderer", "text", "runs") instanceof JsonArray runs) {
                    for (JsonElement run : runs) text.append(string(path(run, "text")));
                }
                columns.add(text.toString());
            }
        }
        if (columns.isEmpty() || columns.getFirst().isBlank()) return null;
        String artist = "", album = "";
        double seconds = Double.NaN;
        if (columns.size() > 1) {
            List<String> parts = new ArrayList<>(List.of(columns.get(1).split(" • ")));
            if (!parts.isEmpty() && parts.getLast().matches("\\d+(:\\d\\d)+")) seconds = seconds(parts.removeLast());
            if (!parts.isEmpty()) artist = parts.removeFirst();
            if (!parts.isEmpty()) album = parts.getLast();
        }
        if (seconds > 3600) return null;
        String plays = columns.size() > 2 ? columns.get(2) : "";
        String art = "";
        if (path(row, "thumbnail", "musicThumbnailRenderer", "thumbnail", "thumbnails") instanceof JsonArray thumbs && !thumbs.isEmpty()) {
            art = string(path(thumbs.get(thumbs.size() - 1), "url"));
        }
        return new Result(id, columns.getFirst(), artist, album, seconds, plays, art, "https://music.youtube.com/watch?v=" + id);
    }

    private static double seconds(String time) {
        double s = 0;
        for (String part : time.split(":")) s = s * 60 + Integer.parseInt(part);
        return s;
    }

    private static JsonElement path(JsonElement e, String... keys) {
        for (String k : keys) {
            if (!(e instanceof JsonObject o)) return null;
            e = o.get(k);
        }
        return e;
    }

    private static String string(JsonElement e) {
        return e != null && e.isJsonPrimitive() ? e.getAsString() : "";
    }

    // ---------------------------------------------------------------- yt-dlp

    private static List<Result> ytDlp(long mine, String query, Tools tools) throws Exception {
        Process p;
        synchronized (Search.class) {
            if (mine != generation) return List.of();
            p = new ProcessBuilder(tools.ytDlp().toString(), "--flat-playlist", "--dump-json", "--no-warnings",
                    "--", "ytsearch" + RESULTS + ":" + query).redirectErrorStream(true).start();
            process = p;
        }
        List<Result> results = new ArrayList<>();
        String error = null;
        try (BufferedReader out = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = out.readLine()) != null) {
                if (line.startsWith("{")) {
                    if (JsonParser.parseString(line) instanceof JsonObject o) {
                        Result r = video(o);
                        if (r != null) results.add(r);
                    }
                } else if (line.startsWith("ERROR:")) {
                    error = line.substring("ERROR:".length()).strip();
                }
            }
        }
        p.waitFor();
        if (results.isEmpty() && error != null) throw new IllegalStateException(error);
        return results;
    }

    private static Result video(JsonObject o) {
        String id = string(o.get("id"));
        if (id.isEmpty()) return null;
        // Live streams can't be downloaded, and the downloader skips anything over an hour.
        if ("is_live".equals(string(o.get("live_status")))) return null;
        JsonElement d = o.get("duration");
        double seconds = d != null && d.isJsonPrimitive() && d.getAsJsonPrimitive().isNumber() ? d.getAsDouble() : Double.NaN;
        if (seconds > 3600) return null;
        String url = string(o.get("url"));
        if (url.isEmpty()) url = "https://www.youtube.com/watch?v=" + id;
        String channel = string(o.get("channel"));
        if (channel.isEmpty()) channel = string(o.get("uploader"));
        if (channel.endsWith(" - Topic")) channel = channel.substring(0, channel.length() - " - Topic".length());
        return new Result(id, string(o.get("title")), channel, "", seconds, "", "https://i.ytimg.com/vi/" + id + "/default.jpg", url);
    }

    private static void stopProcess() {
        if (process != null) {
            process.destroy();
            process = null;
        }
    }
}
