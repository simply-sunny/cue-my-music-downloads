package mix.cuemymusic.downloads;

import java.io.IOException;
import java.io.InputStream;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.SharedConstants;
import net.minecraft.client.Minecraft;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.metadata.pack.PackFormat;
import net.minecraft.server.packs.repository.PackRepository;

/**
 * The "Cue My Music Downloads" resource pack in the resourcepacks folder.
 *
 * <p>Every song is one Ogg file under {@code sounds/music/}, listed in a single
 * sound event, {@code cuemymusic_dl:music.downloads}. The game never plays
 * that event itself, so the songs only play from Cue My Music. Titles and
 * artists go in {@code cuemymusic.json}, which Cue My Music reads for credits.
 */
final class DownloadPack {
    static final String NAME = "Cue My Music Downloads";
    static final String ID = "file/" + NAME;
    private static final String NAMESPACE = "cuemymusic_dl";
    private static final String EVENT = "music.downloads";
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();

    /** One downloaded song. {@code file} is the name under sounds/music, without .ogg. */
    record Song(String file, String title, String artist, String album, String source, String sourceId) {
        String sound() {
            return NAMESPACE + ":music/" + file;
        }
    }

    private DownloadPack() {
    }

    static Path root() {
        return FabricLoader.getInstance().getGameDir().resolve("resourcepacks").resolve(NAME);
    }

    private static Path music() {
        return root().resolve("assets").resolve(NAMESPACE).resolve("sounds").resolve("music");
    }

    private static Path credits() {
        return root().resolve("assets").resolve(NAMESPACE).resolve("cuemymusic.json");
    }

    /** The songs in the pack, in the order they were added. */
    /** The songs as last read, and when: the Downloads page asks every frame, so the file is read at most once a second. */
    private static List<Song> songs;
    private static long readAt;

    /** The downloaded songs, from the pack's credits file. */
    static synchronized List<Song> songs() {
        long now = System.nanoTime();
        if (songs == null || now - readAt > 1_000_000_000L) {
            songs = List.copyOf(read());
            readAt = now;
        }
        return songs;
    }

    private static List<Song> read() {
        List<Song> out = new ArrayList<>();
        Path file = credits();
        if (!Files.isRegularFile(file)) return out;
        try (Reader r = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            JsonElement root = JsonParser.parseReader(r);
            if (!(root instanceof JsonObject o) || !(o.get("tracks") instanceof JsonObject tracks)) return out;
            String prefix = NAMESPACE + ":music/";
            for (var e : tracks.entrySet()) {
                if (!e.getKey().startsWith(prefix) || !(e.getValue() instanceof JsonObject t)) continue;
                String name = e.getKey().substring(prefix.length());
                if (!Files.isRegularFile(music().resolve(name + ".ogg"))) continue;
                out.add(new Song(name, text(t, "title"), text(t, "artist"), text(t, "album"), text(t, "source"),
                        text(t, "id")));
            }
        } catch (Exception e) {
            DownloadsClient.LOG.warn("Couldn't read {}", file, e);
        }
        return out;
    }

    /**
     * Moves a finished download into the pack. A song downloaded before (same
     * site and id) is replaced. Returns the song and whether it replaced one.
     */
    static synchronized Added add(Path ogg, String title, String artist, String album, String source, String sourceId)
            throws IOException {
        List<Song> songs = new ArrayList<>(songs());
        Song old = songs.stream().filter(s -> sourceId.equals(s.sourceId())).findFirst().orElse(null);
        String file = old != null ? old.file() : freeName(songs, sourceId);
        Files.createDirectories(music());
        Files.move(ogg, music().resolve(file + ".ogg"), StandardCopyOption.REPLACE_EXISTING);
        Song song = new Song(file, title, artist, album, source, sourceId);
        if (old != null) songs.set(songs.indexOf(old), song);
        else songs.add(song);
        write(songs);
        return new Added(song, old != null);
    }

    record Added(Song song, boolean replaced) {
    }

    static synchronized void remove(Song song) throws IOException {
        List<Song> songs = new ArrayList<>(songs());
        songs.removeIf(s -> s.file().equals(song.file()));
        Files.deleteIfExists(music().resolve(song.file() + ".ogg"));
        write(songs);
    }

    /** Rewrites pack.mcmeta for this game version, if the pack exists, so a game update doesn't mark it incompatible. */
    static synchronized void refreshMeta() {
        if (!Files.isDirectory(root())) return;
        try {
            writeMeta();
        } catch (IOException e) {
            DownloadsClient.LOG.warn("Couldn't update {}", root().resolve("pack.mcmeta"), e);
        }
    }

    /** Turns the pack on if it's off, then reloads resources so its songs show up. Call on the client thread. */
    static void apply() {
        Minecraft mc = Minecraft.getInstance();
        PackRepository repo = mc.getResourcePackRepository();
        repo.reload();
        if (repo.getSelectedIds().contains(ID)) {
            mc.reloadResourcePacks();
        } else if (repo.addPack(ID)) {
            mc.options.updateResourcePacks(repo);
        } else {
            DownloadsClient.LOG.warn("Couldn't find the {} pack after writing it", NAME);
        }
    }

    private static void write(List<Song> songs) throws IOException {
        DownloadPack.songs = null;
        writeMeta();
        Path assets = root().resolve("assets").resolve(NAMESPACE);
        Files.createDirectories(assets);

        JsonArray sounds = new JsonArray();
        JsonObject tracks = new JsonObject();
        for (Song s : songs) {
            JsonObject entry = new JsonObject();
            entry.addProperty("name", s.sound());
            entry.addProperty("stream", true);
            sounds.add(entry);

            JsonObject t = new JsonObject();
            t.addProperty("title", s.title());
            if (!s.artist().isEmpty()) t.addProperty("artist", s.artist());
            if (!s.album().isEmpty()) t.addProperty("album", s.album());
            t.addProperty("source", s.source());
            t.addProperty("id", s.sourceId());
            tracks.add(s.sound(), t);
        }
        JsonObject soundsJson = new JsonObject();
        if (!sounds.isEmpty()) {
            JsonObject event = new JsonObject();
            event.add("sounds", sounds);
            soundsJson.add(EVENT, event);
        }
        JsonObject creditsJson = new JsonObject();
        creditsJson.add("tracks", tracks);
        writeJson(assets.resolve("sounds.json"), soundsJson);
        writeJson(credits(), creditsJson);
    }

    private static void writeMeta() throws IOException {
        Files.createDirectories(root());
        PackFormat format = SharedConstants.getCurrentVersion().packVersion(PackType.CLIENT_RESOURCES);
        JsonArray version = new JsonArray();
        version.add(format.major());
        version.add(format.minor());
        JsonObject pack = new JsonObject();
        pack.addProperty("description", "Songs saved with /cmm download");
        pack.add("min_format", version);
        pack.add("max_format", version);
        JsonObject meta = new JsonObject();
        meta.add("pack", pack);
        writeJson(root().resolve("pack.mcmeta"), meta);

        Path icon = root().resolve("pack.png");
        if (!Files.exists(icon)) {
            try (InputStream in = DownloadPack.class.getResourceAsStream("/assets/cuemymusic_downloads/icon.png")) {
                if (in != null) Files.copy(in, icon);
            }
        }
    }

    private static void writeJson(Path file, JsonObject json) throws IOException {
        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(tmp, GSON.toJson(json) + "\n", StandardCharsets.UTF_8);
        Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }

    /**
     * A file name from the site's id that no other song uses. Resource paths
     * only allow lowercase letters, digits, {@code _}, {@code -} and {@code .},
     * so ids that differ only in case get a number on the end.
     */
    private static String freeName(List<Song> songs, String sourceId) {
        String base = sourceId.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_-]+", "_");
        if (base.isEmpty()) base = "song";
        String name = base;
        for (int n = 2; taken(songs, name); n++) name = base + "_" + n;
        return name;
    }

    private static boolean taken(List<Song> songs, String name) {
        return songs.stream().anyMatch(s -> s.file().equals(name)) || Files.exists(music().resolve(name + ".ogg"));
    }

    private static String text(JsonObject o, String field) {
        JsonElement e = o.get(field);
        return e != null && e.isJsonPrimitive() ? e.getAsString() : "";
    }
}
