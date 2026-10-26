package mix.cuemymusic.downloads;

import java.util.List;

import com.mojang.blaze3d.Blaze3D;

import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import mix.cuemymusic.api.CuePanel;
import mix.cuemymusic.api.PanelCanvas;
import mix.cuemymusic.api.PanelCanvas.ButtonStyle;
import mix.cuemymusic.library.Art;
import mix.cuemymusic.library.MusicLibrary;
import mix.cuemymusic.library.Track;

/**
 * The Downloads page in the player: a link box with Download and Cancel,
 * the running download's progress, and the downloaded songs.
 */
final class DownloadsPanel implements CuePanel {
    private static final String LINK = "link";
    private static final Art ICON = new Art.Texture(
            Identifier.fromNamespaceAndPath("cuemymusic_downloads", "textures/gui/download.png"), 16, 16);
    private static final int RED = 0xFFFF6B6B;
    private static final int DIM = 0xFFB3B3B3;
    private static final int WHITE = 0xFFFFFFFF;

    /** Finding the tools touches the disk, so it's checked every few seconds, not every frame. */
    private Tools tools;
    private long toolsCheckedAt;

    @Override
    public String id() {
        return "cuemymusic_downloads";
    }

    @Override
    public String title() {
        return tr("cuemymusic_downloads.panel.title");
    }

    @Override
    public String subtitle() {
        return Downloader.running() ? tr("cuemymusic_downloads.panel.busy") : tr("cuemymusic_downloads.panel.subtitle");
    }

    @Override
    public Art icon() {
        return ICON;
    }

    @Override
    public String packId() {
        return DownloadPack.ID;
    }

    @Override
    public void draw(PanelCanvas c) {
        List<Track> songs = MusicLibrary.byPack(DownloadPack.ID);
        c.header(ICON, tr("cuemymusic_downloads.panel.kind"), title(),
                tr("cuemymusic_downloads.panel.summary", songs.size(), DownloadPack.NAME), 0xFF1E3E7A);

        c.heading(tr("cuemymusic_downloads.panel.add"));
        Tools tools = tools();
        if (!tools.ready()) {
            c.text(Component.translatable("cuemymusic_downloads.missing", tools.missing()), RED);
            c.text(Component.translatable("cuemymusic_downloads.install", tools.installHint()), WHITE);
            c.space(2);
            c.button(c.left(), tr("cuemymusic_downloads.panel.recheck"), ButtonStyle.SECONDARY, true, () -> toolsCheckedAt = 0);
            c.space(c.buttonHeight() + 10);
        } else {
            boolean running = Downloader.running();
            String action = tr(running ? "cuemymusic_downloads.panel.cancel" : "cuemymusic_downloads.panel.download");
            int bw = c.buttonWidth(action);
            String link = c.textField(LINK, Component.translatable("cuemymusic_downloads.panel.hint"),
                    c.right() - c.left() - bw - 6, text -> start(c, text));
            if (running) {
                c.button(c.right() - bw, action, ButtonStyle.DANGER, true, Downloader::cancel);
            } else {
                c.button(c.right() - bw, action, ButtonStyle.PRIMARY, !link.isBlank(), () -> start(c, link));
            }
            c.space(c.buttonHeight() + 8);

            if (running) {
                Downloader.Status s = Downloader.status();
                c.progress(s.fraction(), s.label().getString());
            } else {
                Downloader.Result r = Downloader.result();
                if (r != null) c.text(r.message(), r.failed() ? RED : DIM);
            }
            c.space(2);
            if (Downloader.lowQuality(tools)) {
                c.text(Component.translatable("cuemymusic_downloads.panel.low_quality", Tools.qualityHint()), 0xFFE0B04A);
            }
            c.text(Component.translatable("cuemymusic_downloads.panel.about"), 0xFF6A6A6A);
        }
        c.space(4);
        c.button(c.left(), tr("cuemymusic_downloads.panel.folder"), ButtonStyle.SECONDARY, true, () -> {
            DownloadPack.refreshMeta();
            Blaze3D.openPath(DownloadPack.root());
        });
        c.space(c.buttonHeight() + 14);

        if (songs.isEmpty()) {
            c.text(Component.translatable("cuemymusic_downloads.panel.empty"), DIM);
        } else {
            c.tracks("pack:" + DownloadPack.ID, songs);
        }
    }

    @Override
    public List<Action> songActions(Track track) {
        return List.of(new Action(tr("cuemymusic_downloads.panel.delete"), () -> delete(track)));
    }

    private void start(PanelCanvas c, String link) {
        if (link.isBlank()) return;
        Component error = Downloader.tryStart(link);
        if (error == null) {
            c.setText(LINK, "");
        } else {
            Downloader.report(error, true);
            toolsCheckedAt = 0;
        }
    }

    private static void delete(Track track) {
        String sound = track.location().toString();
        for (DownloadPack.Song s : DownloadPack.songs()) {
            if (!s.sound().equals(sound)) continue;
            try {
                DownloadPack.remove(s);
                Downloader.report(Component.translatable("cuemymusic_downloads.removed", s.title()), false);
            } catch (Exception e) {
                DownloadsClient.LOG.warn("Couldn't remove {}", s.file(), e);
                Downloader.report(Component.translatable("cuemymusic_downloads.failed", String.valueOf(e.getMessage())), true);
                return;
            }
            DownloadPack.apply();
            return;
        }
    }

    private Tools tools() {
        long now = System.currentTimeMillis();
        if (tools == null || now - toolsCheckedAt > 3000) {
            tools = Tools.find();
            toolsCheckedAt = now;
        }
        return tools;
    }

    private static String tr(String key, Object... args) {
        return Component.translatable(key, args).getString();
    }
}
