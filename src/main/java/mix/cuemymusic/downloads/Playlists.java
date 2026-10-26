package mix.cuemymusic.downloads;

import java.util.List;

import mix.cuemymusic.CueConfig;

/** Cue My Music playlists for playlist links. */
final class Playlists {
    private Playlists() {
    }

    /**
     * Adds the songs, in order, to the playlist with this name, making it if
     * there isn't one. Downloading the same playlist again adds only what's
     * new. Returns the playlist's id.
     */
    static String fill(String name, List<String> songs) {
        CueConfig cfg = CueConfig.INSTANCE;
        String id = cfg.playlists.stream().filter(p -> p.name().equals(name)).map(CueConfig.Playlist::id)
                .findFirst().orElseGet(() -> cfg.createPlaylist(name));
        for (String song : songs) cfg.addToPlaylist(id, song);
        return id;
    }
}
