package mix.cuemymusic.downloads;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
 * The Downloads page in the player, in two tabs: **Download** searches YouTube
 * or takes a link and shows its progress, and **Downloads** lists and filters
 * the songs already saved in the pack.
 */
final class DownloadsPanel implements CuePanel {
    private static final String SEARCH = "search";
    private static final String FILTER = "downloads_filter";
    private static final Art ICON = new Art.Texture(
            Identifier.fromNamespaceAndPath("cuemymusic_downloads", "textures/gui/download.png"), 16, 16);
    private static final int RED = 0xFFFF6B6B;
    private static final int DIM = 0xFFB3B3B3;
    private static final int WHITE = 0xFFFFFFFF;
    private static final int GREEN = 0xFF1ED760;
    /** How many past searches the Find songs tab offers. */
    private static final int RECENT = 5;
    /** The count at the start of YouTube Music's plays line, such as "287M". */
    private static final Pattern PLAYS = Pattern.compile("([\\d][\\d.,]*)\\s*([kmb])?");

    /** Which tab is open. */
    private enum Tab { DOWNLOAD, DOWNLOADS }

    /** How the Find songs tab orders a search's results. */
    private enum Sort {
        RELEVANCE("cuemymusic_downloads.panel.sort.relevance"),
        PLAYS("cuemymusic_downloads.panel.sort.plays"),
        SHORTEST("cuemymusic_downloads.panel.sort.shortest"),
        TITLE("cuemymusic_downloads.panel.sort.title");

        private final String key;

        Sort(String key) {
            this.key = key;
        }

        Sort next() {
            Sort[] all = values();
            return all[(ordinal() + 1) % all.length];
        }
    }

    private Tab tab = Tab.DOWNLOAD;
    private Sort sort = Sort.RELEVANCE;
    private final List<String> recent = new ArrayList<>();
    /**
     * Where browsing has gone from the search, in order: artist, album and
     * playlist pages ({@link Browse.Link}) and songs ({@link Search.Result}).
     * Empty shows the search's results.
     */
    private final List<Object> trail = new ArrayList<>();
    /** Songs picked to download together, from any page, in the order picked. */
    private final java.util.LinkedHashMap<String, Search.Result> picked = new java.util.LinkedHashMap<>();
    /** Whether the picked songs are listed under the bar. */
    private boolean pickedOpen;

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
        drawTabs(c, songs.size());
        if (tab == Tab.DOWNLOAD) drawDownload(c);
        else drawDownloads(c, songs);
    }

    /** The two tabs, as the player's Mode switch: the open one in white. */
    private void drawTabs(PanelCanvas c, int count) {
        String downloads = count > 0 ? tr("cuemymusic_downloads.panel.tab.downloads_count", count)
                : tr("cuemymusic_downloads.panel.tab.downloads");
        c.tabs(List.of(tr("cuemymusic_downloads.panel.tab.download"), downloads), tab.ordinal(), i -> tab = Tab.values()[i]);
    }

    /** Search, link downloads, progress, and the results. */
    private void drawDownload(PanelCanvas c) {
        Tools tools = tools();
        if (!tools.ready()) {
            c.text(Component.translatable("cuemymusic_downloads.missing", tools.missing()), RED);
            c.text(Component.translatable("cuemymusic_downloads.install", tools.installHint()), WHITE);
            c.space(2);
            c.button(c.left(), tr("cuemymusic_downloads.panel.recheck"), ButtonStyle.SECONDARY, true, () -> toolsCheckedAt = 0);
            c.space(c.buttonHeight() + 10);
            return;
        }

        // One box for both: a link downloads, anything else searches YouTube.
        boolean running = Downloader.running();
        String search = tr("cuemymusic_downloads.panel.search"), download = tr("cuemymusic_downloads.panel.download"),
                cancel = tr("cuemymusic_downloads.panel.cancel");
        int bw = Math.max(c.buttonWidth(search), Math.max(c.buttonWidth(download), c.buttonWidth(cancel)));
        String text = c.textField(SEARCH, Component.translatable("cuemymusic_downloads.panel.hint"),
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
        drawConfirm(c);
        drawPicked(c);
        if (!trail.isEmpty()) drawTrail(c);
        else if (Search.state() == null) drawRecent(c, tools);
        else drawResults(c, tools);
        c.space(2);
        if (Downloader.lowQuality(tools)) {
            c.text(Component.translatable("cuemymusic_downloads.panel.low_quality", Tools.qualityHint()), 0xFFE0B04A);
        }
        c.text(Component.translatable("cuemymusic_downloads.panel.about"), 0xFF6A6A6A);
    }

    /** Past searches as buttons, so the same search doesn't have to be typed again. */
    private void drawRecent(PanelCanvas c, Tools tools) {
        if (recent.isEmpty()) return;
        c.space(6);
        c.text(Component.translatable("cuemymusic_downloads.panel.recent"), DIM);
        int x = c.left();
        for (String query : recent) {
            String label = shorten(query, 28);
            int w = c.buttonWidth(label);
            if (x > c.left() && x + w > c.right()) {
                c.space(c.buttonHeight() + 6);
                x = c.left();
            }
            x += c.button(x, label, ButtonStyle.SECONDARY, true, () -> search(query, tools)) + 6;
        }
        c.space(c.buttonHeight() + 8);
    }

    /** The songs already in the pack, with a box to filter them and the folder button. */
    private void drawDownloads(PanelCanvas c, List<Track> songs) {
        c.heading(tr("cuemymusic_downloads.panel.downloaded_songs"));
        if (Downloader.running()) {
            Downloader.Status s = Downloader.status();
            c.progress(s.fraction(), s.label().getString());
            c.space(2);
        } else {
            Downloader.Result r = Downloader.result();
            if (r != null) {
                c.text(r.message(), r.failed() ? RED : DIM);
                c.space(2);
            }
        }

        String open = tr("cuemymusic_downloads.panel.folder");
        int bw = c.buttonWidth(open);
        String filter = c.textField(FILTER, Component.translatable("cuemymusic_downloads.panel.filter_hint"),
                Math.max(60, c.right() - c.left() - bw - 6), t -> {
                });
        c.button(c.right() - bw, open, ButtonStyle.SECONDARY, true, () -> {
            DownloadPack.refreshMeta();
            Blaze3D.openPath(DownloadPack.root());
        });
        c.space(c.buttonHeight() + 10);

        Tools tools = tools();
        if (Downloader.lowQuality(tools)) {
            c.text(Component.translatable("cuemymusic_downloads.panel.low_quality", Tools.qualityHint()), 0xFFE0B04A);
        }

        List<Track> shown = filtered(songs, filter);
        if (songs.isEmpty()) {
            c.text(Component.translatable("cuemymusic_downloads.panel.empty"), DIM);
        } else if (shown.isEmpty()) {
            c.text(Component.translatable("cuemymusic_downloads.panel.no_matches", filter.strip()), DIM);
        } else {
            String f = filter.strip().toLowerCase(Locale.ROOT);
            c.tracks(f.isEmpty() ? "pack:" + DownloadPack.ID : "pack:" + DownloadPack.ID + ":filter:" + f, shown);
        }
    }

    /** The songs whose title or artist hold the filter, or all of them when it's blank. */
    private static List<Track> filtered(List<Track> songs, String filter) {
        String f = filter.strip().toLowerCase(Locale.ROOT);
        if (f.isEmpty()) return songs;
        return songs.stream()
                .filter(t -> (t.title() + " " + t.artist()).toLowerCase(Locale.ROOT).contains(f))
                .toList();
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
        if (isLink(text)) {
            start(c, text);
        } else {
            search(text.strip(), tools);
        }
    }

    private void search(String query, Tools tools) {
        trail.clear();
        Browse.close();
        Search.start(query, tools);
        remember(query);
    }

    private void remember(String query) {
        recent.removeIf(query::equalsIgnoreCase);
        recent.addFirst(query);
        while (recent.size() > RECENT) recent.removeLast();
    }

    private static boolean isLink(String text) {
        String t = text.strip().toLowerCase(Locale.ROOT);
        return t.startsWith("https://") || t.startsWith("http://");
    }

    /**
     * The latest search, laid out like Spotify's: the top result as a card,
     * then the rest as song rows with cover, title, artist, album and length.
     * Each has a button to download it, a tick once it's downloaded, or its
     * progress while it downloads. The results can be sorted, and more of them
     * asked for.
     */
    private void drawResults(PanelCanvas c, Tools tools) {
        Search.State st = Search.state();
        if (st == null) return;
        c.space(8);
        GuiGraphicsExtractor g = c.graphics();
        Font font = c.font();
        String clear = tr("cuemymusic_downloads.panel.clear");
        String sortLabel = tr(sort.key);
        int bh = c.buttonHeight();
        int clearW = c.buttonWidth(clear), sortW = c.buttonWidth(sortLabel);
        int x = c.right() - clearW;
        c.button(x, clear, ButtonStyle.SECONDARY, true, Search::clear);
        x -= sortW + 6;
        c.button(x, sortLabel, ButtonStyle.SECONDARY, true, () -> sort = sort.next());
        g.text(font, clip(font, tr("cuemymusic_downloads.panel.results", st.query()), x - 8 - c.left()),
                c.left(), c.y() + (bh - 8) / 2, WHITE, false);
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
        Set<String> have = new HashSet<>();
        for (DownloadPack.Song s : DownloadPack.songs()) have.add(s.sourceId());

        if (st.artist() != null) drawArtist(c, st.artist());

        List<Search.Result> results = sorted(st.results());

        // The top result.
        Search.Result top = results.getFirst();
        int y = c.y(), cardH = 72, art = 56;
        g.fill(c.left(), y, c.right(), y + cardH, 0xFF1E1E1E);
        cover(g, top, c.left() + 8, y + 8, art);
        int tx = c.left() + art + 18, tw = c.right() - tx - 10;
        g.text(font, tr(sort == Sort.RELEVANCE ? "cuemymusic_downloads.panel.top" : "cuemymusic_downloads.panel.first"),
                tx, y + 9, DIM, false);
        g.pose().pushMatrix();
        g.pose().translate(tx, y + 22);
        g.pose().scale(1.5f, 1.5f);
        g.text(font, clip(font, top.title(), (int) (tw / 1.5f)), 0, 0, WHITE, false);
        g.pose().popMatrix();
        // The button sits at the bottom right, so the line above it stops short of it.
        int buttonW = buttonWidth(c, top, have, true);
        String open = "\u203A", pick = pickLabel(top, have);
        int moreW = c.buttonWidth(open), pickW = c.buttonWidth(pick);
        int rightOfLine = c.right() - 8 - buttonW - 6 - pickW - 6 - moreW;
        g.text(font, clip(font, line(top), rightOfLine - 10 - tx), tx, y + 41, DIM, false);
        c.space(cardH - bh - 8);
        downloadButton(c, top, have, c.right() - 8, true);
        int px = c.right() - 8 - buttonW - 6 - pickW;
        pickButton(c, top, have, px);
        c.button(px - 6 - moreW, open, ButtonStyle.SECONDARY, true, () -> go(top));
        c.space(y + cardH + 12 - c.y());

        if (results.size() >= 2) {
            g.text(font, tr("cuemymusic_downloads.panel.songs"), c.left(), c.y(), WHITE, false);
            c.space(14);
            songRows(c, results.subList(1, results.size()), have);
        }

        if (st.results().size() >= st.limit() && st.limit() < Search.MAX_RESULTS) {
            c.space(4);
            String more = tr("cuemymusic_downloads.panel.show_more");
            int w = c.buttonWidth(more);
            c.button(c.left() + Math.max(0, (c.right() - c.left() - w) / 2), more, ButtonStyle.SECONDARY, true,
                    () -> Search.start(st.query(), tools, Math.min(Search.MAX_RESULTS, st.limit() + Search.RESULTS)));
            c.space(c.buttonHeight() + 6);
        }
    }

    // ----------------------------------------------------------------- browsing

    /** Opens a song's page, or an artist's, album's or playlist's, after the one shown. */
    private void go(Object place) {
        trail.add(place);
        if (place instanceof Browse.Link link) Browse.open(link);
    }

    /** Back one page; past the first, back to the search's results. */
    private void back() {
        if (trail.isEmpty()) return;
        trail.removeLast();
        // The page before a song's is reopened; it's kept, so this is instant.
        for (int i = trail.size() - 1; i >= 0; i--) {
            if (trail.get(i) instanceof Browse.Link link) {
                Browse.open(link);
                return;
            }
        }
        Browse.close();
    }

    /** Back, where browsing has been, and the page open. */
    private void drawTrail(PanelCanvas c) {
        c.space(8);
        GuiGraphicsExtractor g = c.graphics();
        Font font = c.font();
        String back = "‹ " + tr("cuemymusic_downloads.panel.back");
        int bw = c.button(c.left(), back, ButtonStyle.SECONDARY, true, this::back);
        StringBuilder path = new StringBuilder(Search.state() != null ? Search.state().query() : tr("cuemymusic_downloads.panel.search"));
        for (Object place : trail) path.append("  ›  ").append(placeName(place));
        // Long trails keep their end: where you are matters more than where you started.
        String text = path.toString();
        int room = c.right() - c.left() - bw - 10;
        while (font.width(text) > room && text.length() > 4) text = "…" + text.substring(Math.min(text.length(), 6));
        g.text(font, text, c.left() + bw + 10, c.y() + (c.buttonHeight() - 8) / 2, DIM, false);
        c.space(c.buttonHeight() + 10);
        Object here = trail.getLast();
        if (here instanceof Search.Result song) drawSong(c, song);
        else drawPage(c, (Browse.Link) here);
    }

    private static String placeName(Object place) {
        return place instanceof Search.Result r ? r.title() : ((Browse.Link) place).name();
    }

    /** A song: its cover and details, pick and download, then a button for each of its artists and its album. */
    private void drawSong(PanelCanvas c, Search.Result r) {
        GuiGraphicsExtractor g = c.graphics();
        Font font = c.font();
        Set<String> have = have();
        int y = c.y(), art = 72, bh = c.buttonHeight();
        cover(g, r.art(), c.left(), y, art);
        int tx = c.left() + art + 12, tw = c.right() - tx;
        g.text(font, tr("cuemymusic_downloads.panel.song"), tx, y + 2, DIM, false);
        big(g, font, clip(font, r.title(), (int) (tw / 1.5f)), tx, y + 14, have.contains(r.sourceId()) ? GREEN : WHITE);
        g.text(font, clip(font, line(r).substring(tr("cuemymusic_downloads.panel.song").length()).replaceFirst("^ · ", ""), tw),
                tx, y + 32, DIM, false);
        c.space(art - bh);
        int x = tx;
        x += pickButton(c, r, have, x) + 6;
        downloadButtonAt(c, r, have, x);
        c.space(bh + 14);

        if (!r.artists().isEmpty()) {
            g.text(font, tr(r.artists().size() == 1 ? "cuemymusic_downloads.panel.by" : "cuemymusic_downloads.panel.artists"),
                    c.left(), c.y(), WHITE, false);
            c.space(13);
            buttonRow(c, r.artists().stream().map(a -> new Browse.Link(Browse.Kind.ARTIST, a.id(), "", a.name(), "", "")).toList());
        }
        if (!r.albumId().isEmpty()) {
            g.text(font, tr("cuemymusic_downloads.panel.on_album"), c.left(), c.y(), WHITE, false);
            c.space(13);
            buttonRow(c, List.of(new Browse.Link(Browse.Kind.ALBUM, r.albumId(), "", r.album(), "", r.art())));
        }
    }

    /** Links as buttons that wrap, each opening its page. */
    private void buttonRow(PanelCanvas c, List<Browse.Link> links) {
        int x = c.left();
        for (Browse.Link l : links) {
            String label = shorten(l.name(), 32) + " ›";
            int w = c.buttonWidth(label);
            if (x > c.left() && x + w > c.right()) {
                c.space(c.buttonHeight() + 6);
                x = c.left();
            }
            x += c.button(x, label, ButtonStyle.SECONDARY, true, () -> go(l)) + 6;
        }
        c.space(c.buttonHeight() + 12);
    }

    /** An artist's, album's or playlist's page: its songs to pick from, and its rows of albums, singles and artists. */
    private void drawPage(PanelCanvas c, Browse.Link link) {
        Browse.State st = Browse.state();
        if (st == null || !st.link().key().equals(link.key())) {
            Browse.open(link);
            st = Browse.state();
        }
        if (st.running()) {
            c.progress(-1, tr("cuemymusic_downloads.panel.opening", link.name()));
            return;
        }
        if (st.page() == null) {
            c.text(Component.translatable("cuemymusic_downloads.panel.open_failed", link.name(), String.valueOf(st.error())), RED);
            c.button(c.left(), tr("cuemymusic_downloads.panel.retry"), ButtonStyle.SECONDARY, true, () -> {
                Browse.close();
                Browse.open(link);
            });
            c.space(c.buttonHeight() + 8);
            return;
        }
        Browse.Page page = st.page();
        GuiGraphicsExtractor g = c.graphics();
        Font font = c.font();
        Set<String> have = have();
        int y = c.y(), art = 64, bh = c.buttonHeight();
        cover(g, page.art(), c.left(), y, art);
        int tx = c.left() + art + 12, tw = c.right() - tx;
        g.text(font, tr("cuemymusic_downloads.panel.kind." + link.kind().name().toLowerCase(Locale.ROOT)), tx, y + 2, DIM, false);
        big(g, font, clip(font, page.title(), (int) (tw / 1.5f)), tx, y + 14, WHITE);
        g.text(font, clip(font, page.subtitle(), tw), tx, y + 32, DIM, false);
        c.space(art - bh);
        List<Search.Result> songs = page.songs();
        int x = tx;
        if (!songs.isEmpty()) {
            long fresh = songs.stream().filter(r -> !have.contains(r.sourceId())).count();
            boolean all = songs.stream().allMatch(r -> picked.containsKey(r.id()) || have.contains(r.sourceId()));
            x += c.button(x, tr(all ? "cuemymusic_downloads.panel.unpick_all" : "cuemymusic_downloads.panel.pick_all", songs.size()),
                    ButtonStyle.SECONDARY, fresh > 0, () -> {
                        for (Search.Result r : songs) {
                            if (all) picked.remove(r.id());
                            else if (!have.contains(r.sourceId())) picked.putIfAbsent(r.id(), r);
                        }
                    }) + 6;
            if (link.kind() != Browse.Kind.ARTIST) {
                String name = page.title();
                x += c.button(x, tr("cuemymusic_downloads.panel.download_these", fresh), ButtonStyle.PRIMARY,
                        fresh > 0 && !Downloader.running(), () -> report(Downloader.tryStartPicked(songs, name))) + 6;
            }
        }
        if (link.kind() == Browse.Kind.ARTIST) {
            String url = "https://music.youtube.com/channel/" + link.id();
            boolean current = url.equals(Downloader.current());
            c.button(x, current ? progress() : tr("cuemymusic_downloads.panel.download_all"),
                    current ? ButtonStyle.SECONDARY : ButtonStyle.PRIMARY, !Downloader.running(), () -> start(c, url));
        }
        c.space(bh + 14);

        if (!songs.isEmpty()) {
            if (link.kind() == Browse.Kind.ARTIST) {
                String heading = tr("cuemymusic_downloads.panel.top_songs");
                g.text(font, heading, c.left(), c.y() + (bh - 8) / 2, WHITE, false);
                if (page.allSongs() != null) {
                    Browse.Link all = new Browse.Link(Browse.Kind.PLAYLIST, page.allSongs().id(), page.allSongs().params(),
                            tr("cuemymusic_downloads.panel.all_songs_of", page.title()), "", page.art());
                    String label = tr("cuemymusic_downloads.panel.show_all") + " ›";
                    c.button(c.right() - c.buttonWidth(label), label, ButtonStyle.SECONDARY, true, () -> go(all));
                }
                c.space(bh + 6);
            }
            songRows(c, songs, have);
            c.space(8);
        }
        for (Browse.Section section : page.sections()) {
            if (!section.title().isEmpty()) {
                g.text(font, section.title(), c.left(), c.y() + (bh - 8) / 2, WHITE, false);
                if (section.more() != null) {
                    String label = tr("cuemymusic_downloads.panel.show_all") + " ›";
                    Browse.Link more = new Browse.Link(Browse.Kind.PLAYLIST, section.more().id(), section.more().params(),
                            section.title() + " · " + page.title(), "", "");
                    c.button(c.right() - c.buttonWidth(label), label, ButtonStyle.SECONDARY, true, () -> go(more));
                }
                c.space(bh + 6);
            }
            for (Browse.Link item : section.items()) linkRow(c, item);
            c.space(10);
        }
    }

    /** An album, single, playlist or artist to open: its cover, name, the line under it, and Open. */
    private void linkRow(PanelCanvas c, Browse.Link l) {
        GuiGraphicsExtractor g = c.graphics();
        Font font = c.font();
        int y = c.y(), rowH = 30, bh = c.buttonHeight();
        boolean hover = c.mouseX() >= c.left() - 4 && c.mouseX() < c.right() + 4 && c.mouseY() >= y && c.mouseY() < y + rowH;
        if (hover) g.fill(c.left() - 4, y, c.right() + 4, y + rowH, 0xFF2A2A2A);
        cover(g, l.art(), c.left(), y + 3, 24);
        String open = tr("cuemymusic_downloads.panel.open");
        int ow = c.buttonWidth(open), textW = c.right() - ow - 10 - (c.left() + 32);
        g.text(font, clip(font, l.name(), textW), c.left() + 32, y + 5, WHITE, false);
        g.text(font, clip(font, l.subtitle(), textW), c.left() + 32, y + 17, DIM, false);
        c.space((rowH - bh) / 2);
        c.button(c.right() - ow, open, ButtonStyle.SECONDARY, true, () -> go(l));
        c.space(y + rowH - c.y());
    }

    /**
     * Song rows: cover, title, artist, album and length, then buttons to open
     * the song's page, pick it, and download it now.
     */
    private void songRows(PanelCanvas c, List<Search.Result> songs, Set<String> have) {
        GuiGraphicsExtractor g = c.graphics();
        Font font = c.font();
        int bh = c.buttonHeight();
        boolean albums = c.right() - c.left() > 420;
        int rowH = 30, size = 24;
        String more = "›";
        int moreW = c.buttonWidth(more), pickW = c.buttonWidth("✔"), downW = c.buttonWidth("100%");
        int downX = c.right() - downW, pickX = downX - 4 - pickW, moreX = pickX - 4 - moreW;
        int timeX = moreX - 8, albumX = c.left() + (c.right() - c.left()) * 50 / 100;
        for (Search.Result r : songs) {
            int y = c.y();
            boolean hover = c.mouseX() >= c.left() - 4 && c.mouseX() < c.right() + 4 && c.mouseY() >= y && c.mouseY() < y + rowH;
            boolean isPicked = picked.containsKey(r.id());
            if (isPicked) g.fill(c.left() - 4, y, c.right() + 4, y + rowH, 0xFF1F3327);
            else if (hover) g.fill(c.left() - 4, y, c.right() + 4, y + rowH, 0xFF2A2A2A);
            cover(g, r.art(), c.left(), y + 3, size);
            int textX = c.left() + size + 8, textW = (albums ? albumX - 10 : timeX - font.width("00:00") - 10) - textX;
            boolean downloaded = have.contains(r.sourceId());
            g.text(font, clip(font, r.title(), textW), textX, y + 5, downloaded ? GREEN : WHITE, false);
            g.text(font, clip(font, r.artist(), textW), textX, y + 17, DIM, false);
            if (albums) g.text(font, clip(font, r.album(), timeX - font.width("00:00") - 10 - albumX), albumX, y + 11, DIM, false);
            if (!Double.isNaN(r.seconds())) {
                String t = time(r.seconds());
                g.text(font, t, timeX - font.width(t), y + 11, DIM, false);
            }
            c.space((rowH - bh) / 2);
            c.button(moreX, more, ButtonStyle.SECONDARY, true, () -> go(r));
            pickButton(c, r, have, pickX);
            downloadButton(c, r, have, c.right(), false);
            c.space(y + rowH - c.y());
        }
    }

    /** + to pick a song for downloading together, ✓ once picked (click again to unpick). Off once it's downloaded. */
    private int pickButton(PanelCanvas c, Search.Result r, Set<String> have, int x) {
        boolean isPicked = picked.containsKey(r.id());
        return c.button(x, pickLabel(r, have), isPicked ? ButtonStyle.PRIMARY : ButtonStyle.SECONDARY, !have.contains(r.sourceId()), () -> {
            if (picked.remove(r.id()) == null) picked.put(r.id(), r);
        });
    }

    private String pickLabel(Search.Result r, Set<String> have) {
        return picked.containsKey(r.id()) ? "✔" : "+";
    }

    /**
     * The songs picked so far, from any search or page: how many, Download,
     * Clear, and the list itself when opened, with × to take one out.
     */
    private void drawPicked(PanelCanvas c) {
        Set<String> have = have();
        picked.values().removeIf(r -> have.contains(r.sourceId()));
        if (picked.isEmpty()) return;
        GuiGraphicsExtractor g = c.graphics();
        Font font = c.font();
        c.space(8);
        int y = c.y(), bh = c.buttonHeight(), h = bh + 12;
        g.fill(c.left() - 4, y, c.right() + 4, y + h, 0xFF1F3327);
        g.fill(c.left() - 4, y, c.left() - 2, y + h, GREEN);
        String download = tr("cuemymusic_downloads.panel.download_picked"), clear = tr("cuemymusic_downloads.panel.clear");
        String show = tr(pickedOpen ? "cuemymusic_downloads.panel.hide" : "cuemymusic_downloads.panel.show");
        int dw = c.buttonWidth(download), cw = c.buttonWidth(clear), sw = c.buttonWidth(show);
        int dx = c.right() - 6 - dw, cx = dx - 6 - cw, sx = cx - 6 - sw;
        g.text(font, clip(font, tr("cuemymusic_downloads.panel.picked", picked.size()), sx - 10 - (c.left() + 6)), c.left() + 6,
                y + (h - 8) / 2, WHITE, false);
        c.space(6);
        boolean busy = Downloader.running();
        List<Search.Result> songs = List.copyOf(picked.values());
        String name = picksName(songs);
        c.button(dx, download, ButtonStyle.PRIMARY, !busy, () -> {
            Component error = Downloader.tryStartPicked(songs, name);
            if (error == null) picked.clear();
            report(error);
        });
        c.button(cx, clear, ButtonStyle.SECONDARY, true, picked::clear);
        c.button(sx, show, ButtonStyle.SECONDARY, true, () -> pickedOpen = !pickedOpen);
        c.space(h - 6 + 4);
        if (!pickedOpen) return;
        for (Search.Result r : songs) {
            int ry = c.y(), rowH = 16;
            String x = "×";
            int xw = c.buttonWidth(x);
            g.text(font, clip(font, r.title() + "  ·  " + r.artist(), c.right() - xw - 10 - c.left()), c.left() + 6, ry + 4, DIM, false);
            c.button(c.right() - xw, x, ButtonStyle.SECONDARY, true, () -> picked.remove(r.id()));
            c.space(Math.max(rowH, bh + 2));
        }
        c.space(4);
    }

    /** What the playlist of picked songs is called: their album or artist when they share one. */
    private static String picksName(List<Search.Result> songs) {
        String album = songs.getFirst().album(), artist = songs.getFirst().artist();
        boolean oneAlbum = !album.isBlank() && songs.stream().allMatch(r -> r.album().equals(album));
        boolean oneArtist = !artist.isBlank() && songs.stream().allMatch(r -> r.artist().equals(artist));
        return oneAlbum ? album : oneArtist ? artist : tr("cuemymusic_downloads.panel.picked_name");
    }

    private static Set<String> have() {
        Set<String> have = new HashSet<>();
        for (DownloadPack.Song s : DownloadPack.songs()) have.add(s.sourceId());
        return have;
    }

    private static void report(Component error) {
        if (error != null) Downloader.report(error, true);
    }

    private static void big(GuiGraphicsExtractor g, Font font, String s, int x, int y, int color) {
        g.pose().pushMatrix();
        g.pose().translate(x, y);
        g.pose().scale(1.5f, 1.5f);
        g.text(font, s, 0, 0, color, false);
        g.pose().popMatrix();
    }

    /** The results in the chosen order. */
    private List<Search.Result> sorted(List<Search.Result> results) {
        List<Search.Result> out = new ArrayList<>(results);
        switch (sort) {
            case PLAYS -> out.sort(Comparator.comparingDouble((Search.Result r) -> plays(r.plays())).reversed());
            case SHORTEST -> out.sort(Comparator.comparingDouble(
                    r -> Double.isNaN(r.seconds()) ? Double.MAX_VALUE : r.seconds()));
            case TITLE -> out.sort(Comparator.comparing((Search.Result r) -> r.title().toLowerCase(Locale.ROOT)));
            case RELEVANCE -> {
            }
        }
        return out;
    }

    /** "287M plays" as 287,000,000, or -1 when YouTube Music didn't say. */
    private static double plays(String text) {
        Matcher m = PLAYS.matcher(text.toLowerCase(Locale.ROOT));
        if (!m.find()) return -1;
        double n;
        try {
            n = Double.parseDouble(m.group(1).replace(",", ""));
        } catch (NumberFormatException e) {
            return -1;
        }
        String unit = m.group(2);
        if (unit == null) return n;
        return switch (unit) {
            case "k" -> n * 1_000;
            case "m" -> n * 1_000_000;
            case "b" -> n * 1_000_000_000;
            default -> n;
        };
    }

    /** The question for an automatically matched song that may be the wrong one. */
    private static void drawConfirm(PanelCanvas c) {
        Confirm.Match m = Confirm.pending();
        if (m == null) return;
        c.space(8);
        c.text(Component.translatable("cuemymusic_downloads.panel.unsure"), 0xFFE0B04A);
        c.text(Component.translatable("cuemymusic_downloads.panel.spotify", m.spotifyTitle(), m.spotifyArtist(), length(m.spotifySeconds())), DIM);
        c.text(Component.translatable("cuemymusic_downloads.panel.youtube",
                m.youtubeTitle().isBlank() ? tr("cuemymusic_downloads.panel.unknown") : m.youtubeTitle(),
                m.youtubeArtist().isBlank() ? tr("cuemymusic_downloads.panel.unknown") : m.youtubeArtist(),
                length(m.youtubeSeconds())), DIM);
        int x = c.left(), gap = 6;
        x += c.button(x, tr("cuemymusic_downloads.panel.keep"), ButtonStyle.PRIMARY, true, Confirm::keep) + gap;
        x += c.button(x, tr("cuemymusic_downloads.panel.skip"), ButtonStyle.SECONDARY, true, Confirm::skip) + gap;
        c.button(x, tr("cuemymusic_downloads.panel.skip_all"), ButtonStyle.SECONDARY, true, Confirm::skipAll);
        c.space(c.buttonHeight() + 8);
    }

    private static String length(int seconds) {
        return seconds >= 0 ? time(seconds) : "?";
    }

    /** The artist behind the search, with a button to download their whole catalogue. */
    private void drawArtist(PanelCanvas c, Search.Artist a) {
        GuiGraphicsExtractor g = c.graphics();
        Font font = c.font();
        int h = 36, bh = c.buttonHeight(), y = c.y();
        boolean current = a.url().equals(Downloader.current());
        String label = current ? progress() : tr("cuemymusic_downloads.panel.download_all");
        int bw = c.buttonWidth(label);
        String open = tr("cuemymusic_downloads.panel.open");
        int ow = c.buttonWidth(open);
        g.fill(c.left(), y, c.right(), y + h, 0xFF1E1E1E);
        g.text(font, tr("cuemymusic_downloads.panel.artist"), c.left() + 8, y + 6, DIM, false);
        g.text(font, clip(font, a.name(), c.right() - bw - ow - 30 - c.left()), c.left() + 8, y + 19, WHITE, false);
        c.space((h - bh) / 2);
        c.button(c.right() - 8 - bw, label, current ? ButtonStyle.SECONDARY : ButtonStyle.PRIMARY,
                !Downloader.running(), () -> start(c, a.url()));
        c.button(c.right() - 8 - bw - 6 - ow, open, ButtonStyle.SECONDARY, true,
                () -> go(new Browse.Link(Browse.Kind.ARTIST, a.id(), "", a.name(), "", "")));
        c.space(y + h + 10 - c.y());
    }

    /** "42%" while the song or artist downloads, or "…" when yt-dlp doesn't know yet. */
    private static String progress() {
        double f = Downloader.status().fraction();
        return f >= 0 ? Math.round(f * 100) + "%" : "…";
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
    private static void downloadButton(PanelCanvas c, Search.Result r, Set<String> have, int right, boolean big) {
        String label = downloadLabel(r, have, big);
        boolean enabled = !have.contains(r.sourceId()) && Downloader.current() == null;
        int w = buttonWidth(c, r, have, big);
        c.button(right - w, label, big && enabled ? ButtonStyle.PRIMARY : ButtonStyle.SECONDARY, enabled, () -> {
            Component error = Downloader.tryStart(r.url());
            if (error != null) Downloader.report(error, true);
        });
    }

    /** The big Download button at {@code x} on the current line. */
    private static int downloadButtonAt(PanelCanvas c, Search.Result r, Set<String> have, int x) {
        int w = buttonWidth(c, r, have, true);
        downloadButton(c, r, have, x + w, true);
        return w;
    }

    /** Download, a tick once downloaded, or the progress while it downloads. */
    private static String downloadLabel(Search.Result r, Set<String> have, boolean big) {
        if (have.contains(r.sourceId())) return big ? "✔ " + tr("cuemymusic_downloads.panel.downloaded") : "✔";
        if (r.url().equals(Downloader.current())) {
            double f = Downloader.status().fraction();
            return f >= 0 ? Math.round(f * 100) + "%" : "…";
        }
        return big ? "↓ " + tr("cuemymusic_downloads.panel.download") : "↓";
    }

    /** A row's button keeps one width whatever it says, so it doesn't jump as the progress counts up. */
    private static int buttonWidth(PanelCanvas c, Search.Result r, Set<String> have, boolean big) {
        return big ? c.buttonWidth(downloadLabel(r, have, true)) : c.buttonWidth("100%");
    }

    private static void cover(GuiGraphicsExtractor g, Search.Result r, int x, int y, int size) {
        cover(g, r.art(), x, y, size);
    }

    /** A cover, or a dark square with a note while it loads (or when there's none). */
    private static void cover(GuiGraphicsExtractor g, String art, int x, int y, int size) {
        Covers.Cover cover = art == null || art.isEmpty() ? null : Covers.get(art);
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

    /** Shortens a search to fit a button without spilling past the page. */
    private static String shorten(String text, int max) {
        return text.length() <= max ? text : text.substring(0, max - 1).stripTrailing() + "…";
    }

    private void start(PanelCanvas c, String link) {
        if (link.isBlank()) return;
        Component error = Downloader.tryStart(link);
        if (error == null) {
            c.setText(SEARCH, "");
        } else {
            Downloader.report(error, true);
            toolsCheckedAt = 0;
        }
    }

    /** Removes the songs' files, then reloads the pack once. */
    private static void delete(List<Track> tracks) {
        Set<String> sounds = new HashSet<>();
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
