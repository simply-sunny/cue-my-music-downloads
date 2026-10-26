package mix.cuemymusic.downloads;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Finds yt-dlp and ffmpeg. The mod never downloads them; the player installs
 * them. A game started from a launcher often doesn't get the shell's PATH, so
 * the usual install folders are searched as well.
 */
record Tools(Path ytDlp, Path ffmpeg) {
    static final boolean WINDOWS = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).startsWith("windows");
    static final boolean MAC = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).startsWith("mac");

    /** Both tools, or null for each one that's missing. */
    static Tools find() {
        return new Tools(find("yt-dlp"), find("ffmpeg"));
    }

    boolean ready() {
        return ytDlp != null && ffmpeg != null;
    }

    /** "yt-dlp", "ffmpeg", or both, whichever is missing. */
    String missing() {
        return ytDlp == null && ffmpeg == null ? "yt-dlp and ffmpeg" : ytDlp == null ? "yt-dlp" : "ffmpeg";
    }

    /** The command that installs whatever is missing on this system. */
    String installHint() {
        List<String> missing = new ArrayList<>();
        if (ytDlp == null) missing.add(WINDOWS ? "yt-dlp.yt-dlp" : "yt-dlp");
        if (ffmpeg == null) missing.add(WINDOWS ? "Gyan.FFmpeg" : "ffmpeg");
        String names = String.join(" ", missing);
        if (WINDOWS) return "winget install " + names;
        if (MAC) return "brew install " + names;
        return "sudo apt install " + names;
    }

    private static Path find(String name) {
        String file = WINDOWS ? name + ".exe" : name;
        for (Path dir : searchPath()) {
            Path p = dir.resolve(file);
            if (Files.isRegularFile(p) && Files.isExecutable(p)) return p;
        }
        return null;
    }

    private static Set<Path> searchPath() {
        Set<Path> dirs = new LinkedHashSet<>();
        String path = System.getenv("PATH");
        if (path != null) {
            for (String d : path.split(File.pathSeparator)) {
                if (!d.isBlank()) dirs.add(Path.of(d));
            }
        }
        String home = System.getProperty("user.home");
        if (WINDOWS) {
            String local = System.getenv("LOCALAPPDATA");
            if (local != null) dirs.add(Path.of(local, "Microsoft", "WinGet", "Links"));
        } else {
            for (String d : List.of("/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/snap/bin")) dirs.add(Path.of(d));
            if (home != null) dirs.add(Path.of(home, ".local", "bin"));
        }
        return dirs;
    }
}
