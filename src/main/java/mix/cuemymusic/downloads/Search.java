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
    /** How many results a search shows at first. */
    static final int RESULTS = 10;
    /** How many results **Show more** can ask for. */
    static final int MAX_RESULTS = 30;
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8)).followRedirects(HttpClient.Redirect.NORMAL).build();
    /** YouTube Music's search endpoint, and the filter for its Songs tab. */
    private static final String YTM_SEARCH = "https://music.youtube.com/youtubei/v1/search?prettyPrint=false";
    private static final String SONGS_ONLY = "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D";

    /**
     * One song found: its video id, title, artist, album (may be empty), length
     * in seconds (NaN if unknown), plays as YouTube Music shows them ("287M
     * plays"; may be empty), cover art link (may be empty), the link to
     * download, the artist's channel (may be empty), every artist it credits
     * that has a page, and its album's page id (may be empty).
     */
    record Result(String id, String title, String artist, String album, double seconds, String plays, String art, String url,
            String artistId, List<Artist> artists, String albumId) {
        /** The id the download pack keeps for it, to tell if it's already downloaded. */
        String sourceId() {
            return "youtube_" + id;
        }
    }

    /** An artist the search found, whose whole channel can be downloaded. */
    record Artist(String name, String id) {
        String url() {
            return "https://music.youtube.com/channel/" + id;
        }
    }

    /**
     * What the page shows: the query, whether it's still running, the results or
     * why there are none, the artist to offer a whole-catalogue download for,
     * and how many results were asked for.
     */
    record State(String query, boolean running, List<Result> results, Artist artist, String error, int limit) {
    }

    private static volatile State state;
    private static long generation;
    private static Process process;

    private Search() {
    }

    /**
     * Candidates for an automatic match, best first. Unlike the page's search
     * this keeps no state, so a Spotify track can be matched while a download runs.
     */
    static List<Result> query(String query) throws Exception {
        return officialFirst(youTubeMusic(query, RESULTS), query);
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
    static void start(String query, Tools tools) {
        start(query, tools, RESULTS);
    }

    /** Starts searching for {@code query}, asking for up to {@code limit} results. */
    static synchronized void start(String query, Tools tools, int limit) {
        long mine = ++generation;
        stopProcess();
        state = new State(query, true, List.of(), null, null, limit);
        Thread t = new Thread(() -> run(mine, query, tools, limit), "Cue My Music search");
        t.setDaemon(true);
        t.start();
    }

    private static void run(long mine, String query, Tools tools, int limit) {
        List<Result> results = List.of();
        String error = null;
        try {
            results = youTubeMusic(query, limit);
        } catch (Exception e) {
            DownloadsClient.LOG.warn("YouTube Music search for {} failed, trying yt-dlp", query, e);
        }
        if (results.isEmpty() && tools != null) {
            try {
                results = ytDlp(mine, query, tools, limit);
            } catch (Exception e) {
                DownloadsClient.LOG.warn("Search for {} failed", query, e);
                error = String.valueOf(e.getMessage());
            }
        }
        results = officialFirst(results, query);
        Artist artist = artist(results, query);
        synchronized (Search.class) {
            if (mine != generation) return;
            process = null;
            state = new State(query, false, List.copyOf(results), artist, results.isEmpty() ? error : null, limit);
        }
    }

    /**
     * The artist to offer "download all" for: the first result's artist when the
     * search is about them. The name comes from the song row, not the artist
     * page, because YouTube Music sometimes shows a different name there
     * (C418's page is "Daniel Rosenfeld") than on the artist's songs.
     */
    static Artist artist(List<Result> results, String query) {
        for (Result r : results) {
            if (r.artistId().isBlank() || r.artist().isBlank()) continue;
            if (related(query, r.artist())) return new Artist(r.artist(), r.artistId());
        }
        return null;
    }

    /** True if one phrase's words all appear in the other, so "minecraft c418" matches C418 but "aria math" doesn't. */
    static boolean related(String a, String b) {
        String x = words(a), y = words(b);
        return !x.isBlank() && !y.isBlank() && (contains(x, y) || contains(y, x));
    }

    private static String words(String s) {
        return s.toLowerCase(java.util.Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", " ").strip();
    }

    private static boolean contains(String haystack, String needle) {
        List<String> have = List.of(haystack.split(" "));
        for (String w : needle.split(" ")) {
            if (!have.contains(w)) return false;
        }
        return true;
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

    private static List<Result> youTubeMusic(String query, int limit) throws Exception {
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
        collect(JsonParser.parseString(response.body()), results, limit);
        return results;
    }

    /** Finds each song row in the response, wherever it is. */
    private static void collect(JsonElement e, List<Result> out, int limit) {
        if (out.size() >= limit) return;
        if (e instanceof JsonObject o) {
            if (o.get("musicResponsiveListItemRenderer") instanceof JsonObject row) {
                Result r = row(row);
                if (r != null) out.add(r);
                return;
            }
            for (var entry : o.entrySet()) collect(entry.getValue(), out, limit);
        } else if (e instanceof JsonArray a) {
            for (JsonElement x : a) collect(x, out, limit);
        }
    }

    /** A search's song row. */
    private static Result row(JsonObject row) {
        return row(row, List.of(), "", "");
    }

    /**
     * A song row, from a search, an artist's songs, an album or a playlist:
     * the title, then columns that hold its artists, album, plays and length
     * in an order that differs by page. Artists and the album are found by
     * what they link to. A row naming no artist gets {@code byline}'s (an
     * album's own tracks), and one with no album or cover gets {@code album}
     * and {@code art}.
     */
    static Result row(JsonObject row, List<Artist> byline, String album, String art) {
        String id = string(path(row, "playlistItemData", "videoId"));
        if (id.isEmpty()) return null;
        JsonArray cols = row.get("flexColumns") instanceof JsonArray a ? a : new JsonArray();
        List<JsonElement> columns = new ArrayList<>();
        for (JsonElement c : cols) columns.add(path(c, "musicResponsiveListItemFlexColumnRenderer", "text"));
        if (row.get("fixedColumns") instanceof JsonArray fixed) {
            for (JsonElement c : fixed) columns.add(path(c, "musicResponsiveListItemFixedColumnRenderer", "text"));
        }
        if (columns.isEmpty() || Browse.text(columns.getFirst()).isBlank()) return null;
        String title = Browse.text(columns.getFirst());
        List<Artist> artists = new ArrayList<>();
        String artistLine = "", albumName = "", albumId = "", plays = "";
        double seconds = Double.NaN;
        for (JsonElement column : columns.subList(1, columns.size())) {
            if (!(path(column, "runs") instanceof JsonArray runs)) continue;
            // The artists' names as the row shows them, "C418 & Protostar", from the first to the last that links.
            int firstArtist = -1, lastArtist = -1;
            for (int i = 0; i < runs.size(); i++) {
                JsonElement run = runs.get(i);
                String text = string(path(run, "text")).strip();
                String type = string(path(run, "navigationEndpoint", "browseEndpoint",
                        "browseEndpointContextSupportedConfigs", "browseEndpointContextMusicConfig", "pageType"));
                String browseId = string(path(run, "navigationEndpoint", "browseEndpoint", "browseId"));
                if (type.equals("MUSIC_PAGE_TYPE_ARTIST") && !browseId.isEmpty()) {
                    artists.add(new Artist(text, browseId));
                    if (firstArtist < 0) firstArtist = i;
                    lastArtist = i;
                } else if (type.equals("MUSIC_PAGE_TYPE_ALBUM") && !browseId.isEmpty()) {
                    albumName = text;
                    albumId = browseId;
                } else if (text.matches("\\d+(:\\d\\d)+")) {
                    seconds = seconds(text);
                } else if (text.toLowerCase(java.util.Locale.ROOT).endsWith("plays")) {
                    plays = text;
                }
            }
            if (firstArtist >= 0 && artistLine.isEmpty()) {
                StringBuilder b = new StringBuilder();
                for (int i = firstArtist; i <= lastArtist; i++) b.append(string(path(runs.get(i), "text")));
                artistLine = b.toString().strip();
            }
        }
        // A search row with no links still reads "Artist • Album • 3:40".
        if (artistLine.isEmpty() && columns.size() > 1) {
            List<String> parts = new ArrayList<>(List.of(Browse.text(columns.get(1)).split(" • ")));
            if (!parts.isEmpty() && parts.getLast().matches("\\d+(:\\d\\d)+")) {
                if (Double.isNaN(seconds)) seconds = seconds(parts.getLast());
                parts.removeLast();
            }
            if (!parts.isEmpty() && !parts.getFirst().toLowerCase(java.util.Locale.ROOT).endsWith("plays")) artistLine = parts.removeFirst();
            if (!parts.isEmpty() && albumName.isEmpty()) albumName = parts.getLast();
        }
        if (artists.isEmpty() && artistLine.isEmpty() && !byline.isEmpty()) {
            artists.addAll(byline);
            artistLine = String.join(" & ", byline.stream().map(Artist::name).toList());
        }
        if (albumName.isEmpty()) albumName = album;
        if (seconds > 3600) return null;
        String cover = Browse.lastThumbnail(row.get("thumbnail"));
        if (cover.isEmpty()) cover = art;
        String artistId = artists.isEmpty() ? artistId(cols.size() > 1 ? cols.get(1) : null) : artists.getFirst().id();
        return new Result(id, title, artistLine, albumName, seconds, plays, cover,
                "https://music.youtube.com/watch?v=" + id, artistId, List.copyOf(artists), albumId);
    }

    /** The channel id behind a row's artist column, or "" if the row has none. */
    private static String artistId(JsonElement column) {
        if (column == null) return "";
        if (!(path(column, "musicResponsiveListItemFlexColumnRenderer", "text", "runs") instanceof JsonArray runs)) return "";
        for (JsonElement run : runs) {
            String id = string(path(run, "navigationEndpoint", "browseEndpoint", "browseId"));
            String type = string(path(run, "navigationEndpoint", "browseEndpoint",
                    "browseEndpointContextSupportedConfigs", "browseEndpointContextMusicConfig", "pageType"));
            if (!id.isEmpty() && "MUSIC_PAGE_TYPE_ARTIST".equals(type)) return id;
        }
        return "";
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

    private static List<Result> ytDlp(long mine, String query, Tools tools, int limit) throws Exception {
        Process p;
        synchronized (Search.class) {
            if (mine != generation) return List.of();
            p = new ProcessBuilder(tools.ytDlp().toString(), "--flat-playlist", "--dump-json", "--no-warnings",
                    "--", "ytsearch" + limit + ":" + query).redirectErrorStream(true).start();
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
        String channelId = string(o.get("channel_id"));
        return new Result(id, string(o.get("title")), channel, "", seconds, "", "https://i.ytimg.com/vi/" + id + "/default.jpg", url,
                channelId, channel.isEmpty() || channelId.isEmpty() ? List.of() : List.of(new Artist(channel, channelId)), "");
    }

    private static void stopProcess() {
        if (process != null) {
            process.destroy();
            process = null;
        }
    }
}
