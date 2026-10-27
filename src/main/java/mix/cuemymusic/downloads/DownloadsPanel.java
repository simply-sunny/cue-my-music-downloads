package mix.cuemymusic.downloads;

import java.util.List;

import com.mojang.blaze3d.Blaze3D;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import mix.cuemymusic.api.CuePanel;
import mix.cuemymusic.api.PanelCanvas;
import mix.cuemymusic.api.PanelCanvas.ButtonStyle;
import mix.cuemymusic.library.Art;
import mix.cuemymusic.library.MusicLibrary;
import mix.cuemymusic.library.Track;

/**
 * The Downloads page in the player: a box that searches YouTube or takes a
 * link, the search results, the running download's progress, and the
 * downloaded songs.
 */
final class DownloadsPanel implements CuePanel {
    private static final String LINK = "link";
    private static final Art ICON = new Art.Texture(
            Identifier.fromNamespaceAndPath("cuemymusic_downloads", "textures/gui/download.png"), 16, 16);
    private static final int RED = 0xFFFF6B6B;
    private static final int DIM = 0xFFB3B3B3;
    private static final int WHITE = 0xFFFFFFFF;
    private static final int GREEN = 0xFF1ED760;

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
            // One box for both: a link downloads, anything else searches YouTube.
            boolean running = Downloader.running();
            String search = tr("cuemymusic_downloads.panel.search"), download = tr("cuemymusic_downloads.panel.download"),
                    cancel = tr("cuemymusic_downloads.panel.cancel");
            int bw = Math.max(c.buttonWidth(search), Math.max(c.buttonWidth(download), c.buttonWidth(cancel)));
            String text = c.textField(LINK, Component.translatable("cuemymusic_downloads.panel.hint"),
                    c.right() - c.left() - bw - 6, t -> submit(c, t, tools));
            boolean query = !text.isBlank() && !isLink(text);
            if (query) {
                c.button(c.right() - bw, search, ButtonStyle.PRIMARY, true, () -> submit(c, text, tools));
            } else if (running) {
                c.button(c.right() - bw, cancel, ButtonStyle.DANGER, true, Downloader::cancel);
            } else {
                c.button(c.right() - bw, download, ButtonStyle.PRIMARY, !text.isBlank(), () -> submit(c, text, tools));
            }
            c.space(c.buttonHeight() + 8);

            if (running) {
                Downloader.Status s = Downloader.status();
                c.progress(s.fraction(), s.label().getString());
            } else {
                Downloader.Result r = Downloader.result();
                if (r != null) c.text(r.message(), r.failed() ? RED : DIM);
            }
            drawResults(c);
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
    public Action deleteAction(List<Track> tracks) {
        String label = tracks.size() == 1 ? tr("cuemymusic_downloads.panel.delete")
                : tr("cuemymusic_downloads.panel.delete_many", tracks.size());
        return new Action(label, () -> delete(tracks));
    }

    /** Enter or the button: downloads a link, or searches for anything else. */
    private void submit(PanelCanvas c, String text, Tools tools) {
        if (text.isBlank()) return;
        if (isLink(text)) start(c, text);
        else Search.start(text.strip(), tools);
    }

    private static boolean isLink(String text) {
        String t = text.strip().toLowerCase(java.util.Locale.ROOT);
        return t.startsWith("https://") || t.startsWith("http://");
    }

    /**
     * The latest search, laid out like Spotify's: the top result as a card,
     * then the rest as song rows with cover, title, artist, album and length.
     * Each has a button to download it, a tick once it's downloaded, or its
     * progress while it downloads.
     */
    private void drawResults(PanelCanvas c) {
        Search.State st = Search.state();
        if (st == null) return;
        c.space(8);
        GuiGraphicsExtractor g = c.graphics();
        Font font = c.font();
        String clear = tr("cuemymusic_downloads.panel.clear");
        int bh = c.buttonHeight();
        g.text(font, clip(font, tr("cuemymusic_downloads.panel.results", st.query()), c.right() - c.left() - c.buttonWidth(clear) - 8),
                c.left(), c.y() + (bh - 8) / 2, WHITE, false);
        c.button(c.right() - c.buttonWidth(clear), clear, ButtonStyle.SECONDARY, true, Search::clear);
        c.space(bh + 8);
        if (st.running()) {
            c.progress(-1, tr("cuemymusic_downloads.panel.searching"));
            return;
        }
        if (st.results().isEmpty()) {
            c.text(st.error() != null ? Component.translatable("cuemymusic_downloads.panel.search_failed", st.error())
                    : Component.translatable("cuemymusic_downloads.panel.no_results"), st.error() != null ? RED : DIM);
            return;
        }
        java.util.Set<String> have = new java.util.HashSet<>();
        for (DownloadPack.Song s : DownloadPack.songs()) have.add(s.sourceId());

        // The top result.
        Search.Result top = st.results().getFirst();
        int y = c.y(), cardH = 72, art = 56;
        g.fill(c.left(), y, c.right(), y + cardH, 0xFF1E1E1E);
        cover(g, top, c.left() + 8, y + 8, art);
        int tx = c.left() + art + 18, tw = c.right() - tx - 10;
        g.text(font, tr("cuemymusic_downloads.panel.top"), tx, y + 9, DIM, false);
        g.pose().pushMatrix();
        g.pose().translate(tx, y + 22);
        g.pose().scale(1.5f, 1.5f);
        g.text(font, clip(font, top.title(), (int) (tw / 1.5f)), 0, 0, WHITE, false);
        g.pose().popMatrix();
        // The button sits at the bottom right, so the line above it stops short of it.
        int buttonW = buttonWidth(c, top, have, true);
        g.text(font, clip(font, line(top), c.right() - 8 - buttonW - 10 - tx), tx, y + 41, DIM, false);
        c.space(cardH - bh - 8);
        downloadButton(c, top, have, c.right() - 8, true);
        c.space(y + cardH + 12 - c.y());

        if (st.results().size() < 2) return;
        g.text(font, tr("cuemymusic_downloads.panel.songs"), c.left(), c.y(), WHITE, false);
        c.space(14);
        boolean albums = c.right() - c.left() > 360;
        int rowH = 30, cover = 24;
        // The length sits just left of the download button, which is as wide as its widest label.
        int timeX = c.right() - c.buttonWidth("100%") - 12, albumX = c.left() + (c.right() - c.left()) * 55 / 100;
        for (Search.Result r : st.results().subList(1, st.results().size())) {
            y = c.y();
            boolean hover = c.mouseX() >= c.left() - 4 && c.mouseX() < c.right() + 4 && c.mouseY() >= y && c.mouseY() < y + rowH;
            if (hover) g.fill(c.left() - 4, y, c.right() + 4, y + rowH, 0xFF2A2A2A);
            cover(g, r, c.left(), y + 3, cover);
            int textX = c.left() + cover + 8, textW = (albums ? albumX - 10 : timeX - font.width("00:00") - 10) - textX;
            boolean downloaded = have.contains(r.sourceId());
            g.text(font, clip(font, r.title(), textW), textX, y + 5, downloaded ? GREEN : WHITE, false);
            g.text(font, clip(font, r.artist(), textW), textX, y + 17, DIM, false);
            if (albums) g.text(font, clip(font, r.album(), timeX - font.width("00:00") - 10 - albumX), albumX, y + 11, DIM, false);
            if (!Double.isNaN(r.seconds())) {
                String t = time(r.seconds());
                g.text(font, t, timeX - font.width(t), y + 11, DIM, false);
            }
            c.space((rowH - bh) / 2);
            downloadButton(c, r, have, c.right(), false);
            c.space(y + rowH - c.y());
        }
    }

    /** "Song · Kesha · Cannibal · 287M plays", leaving out what isn't known. */
    private static String line(Search.Result r) {
        StringBuilder b = new StringBuilder(tr("cuemymusic_downloads.panel.song"));
        for (String part : new String[] {r.artist(), r.album(), Double.isNaN(r.seconds()) ? "" : time(r.seconds()), r.plays()}) {
            if (!part.isBlank()) b.append(" · ").append(part);
        }
        return b.toString();
    }

    /**
     * Download for {@code r}, ending at {@code right} on the current line: the
     * word on the top result, an arrow on a row. A tick once it's downloaded,
     * and its progress while it is.
     */
    private static void downloadButton(PanelCanvas c, Search.Result r, java.util.Set<String> have, int right, boolean big) {
        String label = downloadLabel(r, have, big);
        boolean enabled = !have.contains(r.sourceId()) && Downloader.current() == null;
        int w = buttonWidth(c, r, have, big);
        c.button(right - w, label, big && enabled ? ButtonStyle.PRIMARY : ButtonStyle.SECONDARY, enabled, () -> {
            Component error = Downloader.tryStart(r.url());
            if (error != null) Downloader.report(error, true);
        });
    }

    /** Download, a tick once downloaded, or the progress while it downloads. */
    private static String downloadLabel(Search.Result r, java.util.Set<String> have, boolean big) {
        if (have.contains(r.sourceId())) return big ? "✔ " + tr("cuemymusic_downloads.panel.downloaded") : "✔";
        if (r.url().equals(Downloader.current())) {
            double f = Downloader.status().fraction();
            return f >= 0 ? Math.round(f * 100) + "%" : "…";
        }
        return big ? "↓ " + tr("cuemymusic_downloads.panel.download") : "↓";
    }

    /** A row's button keeps one width whatever it says, so it doesn't jump as the progress counts up. */
    private static int buttonWidth(PanelCanvas c, Search.Result r, java.util.Set<String> have, boolean big) {
        return big ? c.buttonWidth(downloadLabel(r, have, true)) : c.buttonWidth("100%");
    }

    /** The song's cover, or a dark square with a note while it loads. */
    private static void cover(GuiGraphicsExtractor g, Search.Result r, int x, int y, int size) {
        Covers.Cover cover = Covers.get(r.art());
        if (cover == null) {
            g.fill(x, y, x + size, y + size, 0xFF2E2E2E);
            int n = Math.max(3, size / 6), nx = x + size / 2 - n / 2, ny = y + size / 2 - n;
            g.fill(nx + n - 1, ny - n, nx + n, ny + n, 0xFF6A6A6A);
            g.fill(nx, ny + n - 1, nx + n, ny + n + 1, 0xFF6A6A6A);
            return;
        }
        g.blit(RenderPipelines.GUI_TEXTURED, cover.id(), x, y, 0, 0, size, size, cover.size(), cover.size(), cover.size(), cover.size());
    }

    private static String clip(Font font, String s, int width) {
        if (font.width(s) <= width) return s;
        String dots = "...";
        return font.plainSubstrByWidth(s, Math.max(0, width - font.width(dots))) + dots;
    }

    private static String time(double seconds) {
        int s = (int) Math.round(seconds);
        return s / 60 + ":" + String.format("%02d", s % 60);
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

    /** Removes the songs' files, then reloads the pack once. */
    private static void delete(List<Track> tracks) {
        java.util.Set<String> sounds = new java.util.HashSet<>();
        for (Track t : tracks) sounds.add(t.location().toString());
        int removed = 0;
        String last = null;
        for (DownloadPack.Song s : DownloadPack.songs()) {
            if (!sounds.contains(s.sound())) continue;
            try {
                DownloadPack.remove(s);
                removed++;
                last = s.title();
            } catch (Exception e) {
                DownloadsClient.LOG.warn("Couldn't remove {}", s.file(), e);
                Downloader.report(Component.translatable("cuemymusic_downloads.failed", String.valueOf(e.getMessage())), true);
                if (removed > 0) DownloadPack.apply();
                return;
            }
        }
        if (removed == 0) return;
        Downloader.report(removed == 1 ? Component.translatable("cuemymusic_downloads.removed", last)
                : Component.translatable("cuemymusic_downloads.removed_many", removed), false);
        DownloadPack.apply();
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
