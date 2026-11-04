package mix.cuemymusic.downloads;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * YouTube Music's artist, album and playlist pages, for browsing from a song
 * to its artists and album, from an artist to their songs, albums, singles
 * and the artists fans also like, and on from any of those. Pages load on a
 * background thread and the ones already seen are kept, so going back is
 * instant. Only the newest page asked for is waited on.
 */
final class Browse {
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8)).followRedirects(HttpClient.Redirect.NORMAL).build();
    private static final String YTM_BROWSE = "https://music.youtube.com/youtubei/v1/browse?prettyPrint=false";

    enum Kind { ARTIST, ALBUM, PLAYLIST }

    /** Something to open: an artist, album or playlist, with what YouTube Music shows for it. */
    record Link(Kind kind, String id, String params, String name, String subtitle, String art) {
        /** Two links to the same page are the same, whatever they show. */
        String key() {
            return id + "|" + params;
        }
    }

    /** A row of things to open, such as an artist's Albums. */
    record Section(String title, List<Link> items, Link more) {
    }

    /**
     * A page: its title, the line under it and its art; its songs; the page
     * with all of them when only some are shown (an artist's Top songs); and
     * its rows of albums, singles and artists.
     */
    record Page(Link link, String title, String subtitle, String art, List<Search.Result> songs, Link allSongs, List<Section> sections) {
    }

    /** The page being shown: still loading, loaded, or why it couldn't be. */
    record State(Link link, boolean running, Page page, String error) {
    }

    private static final java.util.Map<String, Page> SEEN = new java.util.concurrent.ConcurrentHashMap<>();
    private static volatile State state;
    private static long generation;

    private Browse() {
    }

    static State state() {
        return state;
    }

    /** Shows {@code link}'s page, from what's been seen if it has, else loading it. */
    static synchronized void open(Link link) {
        long mine = ++generation;
        Page seen = SEEN.get(link.key());
        if (seen != null) {
            state = new State(link, false, seen, null);
            return;
        }
        state = new State(link, true, null, null);
        Thread t = new Thread(() -> {
            Page page = null;
            String error = null;
            try {
                page = fetch(link);
                SEEN.put(link.key(), page);
            } catch (Exception e) {
                DownloadsClient.LOG.warn("Couldn't open {} on YouTube Music", link.name(), e);
                error = String.valueOf(e.getMessage());
            }
            synchronized (Browse.class) {
                if (mine == generation) state = new State(link, false, page, error);
            }
        }, "Cue My Music browse");
        t.setDaemon(true);
        t.start();
    }

    static synchronized void close() {
        generation++;
        state = null;
    }

    private static Page fetch(Link link) throws Exception {
        JsonObject body = new JsonObject();
        JsonObject client = new JsonObject();
        client.addProperty("clientName", "WEB_REMIX");
        client.addProperty("clientVersion", "1.20241023.01.00");
        client.addProperty("hl", "en");
        JsonObject context = new JsonObject();
        context.add("client", client);
        body.add("context", context);
        body.addProperty("browseId", link.id());
        if (!link.params().isEmpty()) body.addProperty("params", link.params());
        HttpRequest request = HttpRequest.newBuilder(URI.create(YTM_BROWSE))
                .timeout(Duration.ofSeconds(12))
                .header("Content-Type", "application/json")
                .header("Origin", "https://music.youtube.com")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString())).build();
        HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new IllegalStateException("HTTP " + response.statusCode());
        return page(link, JsonParser.parseString(response.body()));
    }

    /** Reads a page: its header, every song row, the "show all" link under the songs, and each row of cards. */
    static Page page(Link link, JsonElement root) {
        JsonObject header = header(root);
        String headerTitle = header == null ? "" : text(header.get("title"));
        // An artist goes by the name on their songs: C418's page says "Daniel Rosenfeld".
        String title = headerTitle.isBlank() || link.kind() == Kind.ARTIST && !link.name().isBlank() ? link.name() : headerTitle;
        String subtitle = header == null ? "" : String.join(" · ", nonBlank(text(header.get("subtitle")),
                text(header.get("straplineTextOne")), text(header.get("secondSubtitle"))));
        String headerArt = header == null ? "" : lastThumbnail(header);
        String art = headerArt.isEmpty() ? link.art() : headerArt;
        // An album's tracks name no artist when it's the album's own; those come from its header.
        List<Search.Artist> byline = header == null ? List.of() : artists(header.get("straplineTextOne"));
        String album = link.kind() == Kind.ALBUM ? title : "";

        List<Search.Result> songs = new ArrayList<>();
        Link[] allSongs = {null};
        List<Section> sections = new ArrayList<>();
        walk(root, o -> {
            for (String shelf : new String[] {"musicShelfRenderer", "musicPlaylistShelfRenderer"}) {
                if (!(o.get(shelf) instanceof JsonObject s)) continue;
                if (s.get("contents") instanceof JsonArray rows) {
                    for (JsonElement row : rows) {
                        if (path(row, "musicResponsiveListItemRenderer") instanceof JsonObject r) {
                            Search.Result song = Search.row(r, byline, album, art);
                            if (song != null && link.kind() == Kind.ALBUM && song.albumId().isEmpty()) {
                                // An album's own tracks link back to it.
                                song = new Search.Result(song.id(), song.title(), song.artist(), song.album(), song.seconds(), song.plays(),
                                        song.art(), song.url(), song.artistId(), song.artists(), link.id());
                            }
                            if (song != null) songs.add(song);
                        }
                    }
                }
                Link all = link(path(s, "bottomEndpoint"), "", "");
                if (all == null && path(s, "title", "runs") instanceof JsonArray runs && !runs.isEmpty()) {
                    all = link(path(runs.get(0), "navigationEndpoint"), "", "");
                }
                if (all != null && allSongs[0] == null) {
                    allSongs[0] = new Link(Kind.PLAYLIST, all.id(), all.params(), text(s.get("title")), "", "");
                }
                return true;
            }
            if (o.get("musicCarouselShelfRenderer") instanceof JsonObject c) {
                JsonObject h = path(c, "header", "musicCarouselShelfBasicHeaderRenderer") instanceof JsonObject x ? x : new JsonObject();
                String name = text(h.get("title"));
                Link more = null;
                if (path(h, "title", "runs") instanceof JsonArray runs && !runs.isEmpty()) {
                    more = link(path(runs.get(0), "navigationEndpoint"), name, "");
                }
                List<Link> items = cards(c.get("contents"));
                if (!items.isEmpty()) sections.add(new Section(name, items, more));
                return true;
            }
            if (o.get("gridRenderer") instanceof JsonObject grid) {
                List<Link> items = cards(grid.get("items"));
                if (!items.isEmpty()) sections.add(new Section("", items, null));
                return true;
            }
            return false;
        });
        return new Page(link, title, subtitle, art, List.copyOf(songs), allSongs[0], List.copyOf(sections));
    }

    /** The cards in a carousel or grid that open an artist, album or playlist; videos are left out. */
    private static List<Link> cards(JsonElement contents) {
        List<Link> out = new ArrayList<>();
        if (!(contents instanceof JsonArray items)) return out;
        for (JsonElement item : items) {
            if (!(path(item, "musicTwoRowItemRenderer") instanceof JsonObject card)) continue;
            Link l = link(card.get("navigationEndpoint"), text(card.get("title")), text(card.get("subtitle")));
            if (l == null) continue;
            out.add(new Link(l.kind(), l.id(), l.params(), l.name(), l.subtitle(), lastThumbnail(card)));
        }
        return out;
    }

    /** What a navigation endpoint opens, or null if it isn't an artist, album or playlist page. */
    private static Link link(JsonElement endpoint, String name, String subtitle) {
        JsonElement browse = path(endpoint, "browseEndpoint");
        String id = string(path(browse, "browseId"));
        if (id.isEmpty()) return null;
        String type = string(path(browse, "browseEndpointContextSupportedConfigs", "browseEndpointContextMusicConfig", "pageType"));
        Kind kind;
        if (type.contains("ARTIST") && !type.contains("DISCOGRAPHY")) kind = Kind.ARTIST;
        else if (type.contains("ALBUM") || type.contains("AUDIOBOOK")) kind = Kind.ALBUM;
        else if (type.contains("PLAYLIST") || type.contains("DISCOGRAPHY") || id.startsWith("VL") || id.startsWith("MPAD")) kind = Kind.PLAYLIST;
        else return null;
        return new Link(kind, id, string(path(browse, "params")), name, subtitle, "");
    }

    /** The artists a line of runs links to, in order. */
    static List<Search.Artist> artists(JsonElement text) {
        List<Search.Artist> out = new ArrayList<>();
        if (!(path(text, "runs") instanceof JsonArray runs)) return out;
        for (JsonElement run : runs) {
            Link l = link(path(run, "navigationEndpoint"), string(path(run, "text")), "");
            if (l != null && l.kind() == Kind.ARTIST) out.add(new Search.Artist(l.name(), l.id()));
        }
        return out;
    }

    /** The page's header, whichever kind it has. */
    private static JsonObject header(JsonElement root) {
        JsonObject[] found = {null};
        walk(root, o -> {
            for (String k : new String[] {"musicImmersiveHeaderRenderer", "musicResponsiveHeaderRenderer", "musicVisualHeaderRenderer",
                    "musicDetailHeaderRenderer", "musicEditablePlaylistDetailHeaderRenderer"}) {
                if (found[0] == null && o.get(k) instanceof JsonObject h) {
                    found[0] = h;
                    return true;
                }
            }
            return found[0] != null;
        });
        return found[0];
    }

    /** The biggest picture under {@code e}: the last of the first thumbnail list found. */
    static String lastThumbnail(JsonElement e) {
        String[] url = {""};
        walk(e, o -> {
            if (url[0].isEmpty() && o.get("thumbnails") instanceof JsonArray t && !t.isEmpty()) {
                url[0] = string(path(t.get(t.size() - 1), "url"));
            }
            return !url[0].isEmpty();
        });
        return url[0];
    }

    /** Visits each object under {@code e}; one the visitor handled (returns true) isn't looked inside. */
    private static void walk(JsonElement e, java.util.function.Predicate<JsonObject> visit) {
        if (e instanceof JsonObject o) {
            if (visit.test(o)) return;
            for (var entry : o.entrySet()) walk(entry.getValue(), visit);
        } else if (e instanceof JsonArray a) {
            for (JsonElement x : a) walk(x, visit);
        }
    }

    private static List<String> nonBlank(String... parts) {
        List<String> out = new ArrayList<>();
        for (String p : parts) {
            if (!p.isBlank()) out.add(p.strip());
        }
        return out;
    }

    /** A text's runs joined. */
    static String text(JsonElement e) {
        StringBuilder b = new StringBuilder();
        if (path(e, "runs") instanceof JsonArray runs) {
            for (JsonElement run : runs) b.append(string(path(run, "text")));
        }
        return b.toString();
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
}
