package mix.cuemymusic.downloads;

import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.suggestion.Suggestions;
import com.mojang.brigadier.suggestion.SuggestionsBuilder;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.command.v2.ClientCommands;
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;

/**
 * {@code /cmm download <link>}, {@code /cmm download cancel},
 * {@code /cmm downloads} and {@code /cmm downloads remove <song>}. They join
 * Cue My Music's own {@code /cmm} commands.
 */
public final class DownloadsClient implements ClientModInitializer {
    static final Logger LOG = LoggerFactory.getLogger("cuemymusic_downloads");

    @Override
    public void onInitializeClient() {
        DownloadPack.refreshMeta();
        ClientCommandRegistrationCallback.EVENT.register((dispatcher, registry) -> register(dispatcher));
    }

    private static void register(CommandDispatcher<FabricClientCommandSource> dispatcher) {
        dispatcher.register(ClientCommands.literal("cmm")
                .then(ClientCommands.literal("download")
                        .then(ClientCommands.literal("cancel").executes(c -> {
                            if (!Downloader.cancel()) {
                                c.getSource().sendError(Component.translatable("cuemymusic_downloads.not_running"));
                                return 0;
                            }
                            return 1;
                        }))
                        .then(ClientCommands.argument("link", StringArgumentType.greedyString())
                                .executes(DownloadsClient::download)))
                .then(ClientCommands.literal("downloads")
                        .executes(DownloadsClient::list)
                        .then(ClientCommands.literal("remove")
                                .then(ClientCommands.argument("song", StringArgumentType.greedyString())
                                        .suggests(DownloadsClient::suggestSongs)
                                        .executes(DownloadsClient::remove)))));
    }

    private static int download(CommandContext<FabricClientCommandSource> c) {
        String link = StringArgumentType.getString(c, "link").strip();
        String lower = link.toLowerCase(Locale.ROOT);
        if (!lower.startsWith("https://") && !lower.startsWith("http://") || link.contains(" ")) {
            c.getSource().sendError(Component.translatable("cuemymusic_downloads.not_link"));
            return 0;
        }
        if (Downloader.running()) {
            c.getSource().sendError(Component.translatable("cuemymusic_downloads.busy"));
            return 0;
        }
        Tools tools = Tools.find();
        if (!tools.ready()) {
            String missing = tools.ytDlp() == null && tools.ffmpeg() == null ? "yt-dlp and ffmpeg"
                    : tools.ytDlp() == null ? "yt-dlp" : "ffmpeg";
            c.getSource().sendError(Component.translatable("cuemymusic_downloads.missing", missing));
            c.getSource().sendFeedback(Component.translatable("cuemymusic_downloads.install",
                    Component.literal(tools.installHint()).withStyle(ChatFormatting.YELLOW)));
            return 0;
        }
        Downloader.start(link, tools);
        return 1;
    }

    private static int list(CommandContext<FabricClientCommandSource> c) {
        List<DownloadPack.Song> songs = DownloadPack.songs();
        Component folder = Component.literal(DownloadPack.NAME).withStyle(s -> s
                .withUnderlined(true)
                .withClickEvent(new ClickEvent.OpenFile(DownloadPack.root().toFile())));
        c.getSource().sendFeedback(songs.isEmpty()
                ? Component.translatable("cuemymusic_downloads.none", folder)
                : Component.translatable("cuemymusic_downloads.count", songs.size(), folder));
        for (DownloadPack.Song s : songs) {
            c.getSource().sendFeedback(Component.literal(" " + s.title() + (s.artist().isEmpty() ? "" : " – " + s.artist()))
                    .withStyle(ChatFormatting.GRAY));
        }
        return songs.size();
    }

    private static int remove(CommandContext<FabricClientCommandSource> c) {
        String name = StringArgumentType.getString(c, "song");
        List<DownloadPack.Song> found = find(name);
        if (found.size() != 1) {
            c.getSource().sendError(Component.translatable(
                    found.isEmpty() ? "cuemymusic_downloads.no_song" : "cuemymusic_downloads.several",
                    name, String.join(", ", found.stream().map(DownloadPack.Song::title).limit(5).toList())));
            return 0;
        }
        DownloadPack.Song song = found.getFirst();
        try {
            DownloadPack.remove(song);
        } catch (Exception e) {
            LOG.warn("Couldn't remove {}", song.file(), e);
            c.getSource().sendError(Component.translatable("cuemymusic_downloads.failed", String.valueOf(e.getMessage())));
            return 0;
        }
        DownloadPack.apply();
        c.getSource().sendFeedback(Component.translatable("cuemymusic_downloads.removed", song.title()));
        return 1;
    }

    /** The song with this title, ignoring case; else every song whose title contains it. */
    private static List<DownloadPack.Song> find(String name) {
        String q = name.strip().toLowerCase(Locale.ROOT);
        List<DownloadPack.Song> songs = DownloadPack.songs();
        List<DownloadPack.Song> exact = songs.stream().filter(s -> s.title().toLowerCase(Locale.ROOT).equals(q)).toList();
        if (!exact.isEmpty()) return exact.subList(0, 1);
        return songs.stream().filter(s -> s.title().toLowerCase(Locale.ROOT).contains(q)).toList();
    }

    private static CompletableFuture<Suggestions> suggestSongs(CommandContext<FabricClientCommandSource> c, SuggestionsBuilder b) {
        String typed = b.getRemaining().toLowerCase(Locale.ROOT);
        DownloadPack.songs().stream()
                .map(DownloadPack.Song::title)
                .distinct()
                .filter(t -> t.toLowerCase(Locale.ROOT).contains(typed))
                .sorted()
                .forEach(b::suggest);
        return b.buildFuture();
    }
}
