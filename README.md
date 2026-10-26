<h1 align="center">Cue My Music: Downloads</h1>

<p align="center">An add-on for <a href="https://github.com/simply-sunny/cue-my-music">Cue My Music</a> that saves songs from a link into a resource pack.<br>Fabric &amp; Quilt &nbsp;|&nbsp; 26.3</p>

---

Paste a link into the **Downloads** page of the player, or type `/cmm download <link>`, and the song is downloaded with [yt-dlp](https://github.com/yt-dlp/yt-dlp), converted to Ogg with [ffmpeg](https://ffmpeg.org/), and added to a resource pack called **Cue My Music Downloads**. The pack is turned on for you, and the song shows up on the add-on's **Downloads** page in the player.

A playlist link downloads the whole playlist (up to 200 songs) and makes a Cue My Music playlist with the same name. Downloading it again later adds only the new songs.

Downloaded songs play from the player only. The game never picks them for its own music.

Only download what you have the right to. Many sites don't allow it in their terms.

## Install

Client-side only.

1. Install [Cue My Music](https://github.com/simply-sunny/cue-my-music) 1.2.0 or newer, with its requirements.
2. Install yt-dlp and ffmpeg. The add-on doesn't download them.

   | System | Command |
   | --- | --- |
   | macOS | `brew install yt-dlp ffmpeg vorbis-tools` |
   | Windows | `winget install yt-dlp.yt-dlp Gyan.FFmpeg` |
   | Linux | Your package manager, such as `sudo apt install yt-dlp ffmpeg`. Distro yt-dlp packages are often too old for YouTube; `pipx install yt-dlp` gets the latest. |

3. Put the jar from [Releases](https://github.com/simply-sunny/cue-my-music-downloads/releases) in `mods`.

The add-on looks for both tools on your `PATH`, and in `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`, `/snap/bin`, and `~/.local/bin` (on Windows, WinGet's `Links` folder), since launchers often don't pass on the shell's `PATH`. A tool installed while the game is running is found on the next download.

## Use

Open the player and click **Downloads** in the library. Paste a link and press Enter or **Download**. The page shows the download's progress, has **Cancel** while it runs, and lists your downloaded songs below. Right-click a song there and pick **Delete download** to remove it. **Open folder** opens the pack's folder. If yt-dlp or ffmpeg is missing, the page says which and shows the command to install it.

The same things work from chat:

| Command | Does |
| --- | --- |
| `/cmm download <link>` | Downloads the song, or every song in a playlist. Progress shows above the hotbar. |
| `/cmm download cancel` | Stops the download. |
| `/cmm downloads` | Lists downloaded songs. Click the pack name to open its folder. |
| `/cmm downloads remove <song>` | Deletes a downloaded song. |

- One download runs at a time.
- A video link that also names a playlist (`watch?v=…&list=…`) downloads just the video. Use the playlist's own link (`playlist?list=…`) for all of it.
- Videos in a playlist that can't be downloaded (private, removed, region-locked) are skipped, and chat says how many.
- Cancelling keeps the songs that had finished.
- Spotify links don't work: Spotify only shares playlist contents with apps you log in to. Use a YouTube, YouTube Music, or SoundCloud playlist.
- Live streams and anything over an hour are skipped.
- The title is the track name if the site has one, else the video title. The artist is the site's artist, else the uploader (YouTube's "Artist - Topic" channels become "Artist").
- Downloading the same link again replaces the old copy.

After each download or removal, resources reload so the player sees the change. **That stops whatever is playing**, as any resource reload does.

## The pack

The pack is a normal folder in `resourcepacks`, so you can copy it to another game or share it:

```
resourcepacks/Cue My Music Downloads/
  pack.mcmeta
  pack.png
  assets/cuemymusic_dl/
    sounds.json        one sound event, cuemymusic_dl:music.downloads
    cuemymusic.json    each song's title, artist, album, and link
    sounds/music/*.ogg
```

Files are named after the site's video id.

### Sound quality

Minecraft only plays Ogg Vorbis, so every song is converted to it: stereo, at libvorbis's highest quality (10, about 400 kbps; a 5-minute song is about 15 MB). The source is already compressed (YouTube's audio is Opus at about 130 kbps), so converting again at anything less blurs drums and other sharp sounds you can hear.

That needs libvorbis. The Windows and Linux ffmpeg builds have it. **Homebrew's ffmpeg doesn't**, so on a Mac install `vorbis-tools` as well (`brew install vorbis-tools`), which adds `oggenc`, and the add-on uses that. Without either, ffmpeg's own Vorbis encoder is used, which sounds clearly worse; the Downloads page warns when that's the case. Songs already downloaded that way get the better encoding if you download them again.

To remove everything, delete the folder, or turn the pack off under **Options → Resource Packs**.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Couldn't find yt-dlp` or `ffmpeg` | Install it with the command shown. If it's somewhere unusual, link it into `/usr/local/bin` or `~/.local/bin`. |
| `Download failed` from YouTube | Update yt-dlp (`brew upgrade yt-dlp`, `winget upgrade yt-dlp.yt-dlp`, or `yt-dlp -U`). Sites change often. |
| The song isn't in the player | Check that **Cue My Music Downloads** is on under Resource Packs. |

yt-dlp's full output for a failed download is in `.minecraft/logs/latest.log`.

## Develop

Requires JDK 25 and a built Cue My Music in `../cue-my-music` (`./gradlew buildAll` there), which the add-on compiles against for playlists; see `gradle.properties`. Then `./gradlew build` builds the jar into `build/libs/`.

## License

MIT, see [LICENSE](LICENSE). Copyright © 2026 Saunak Karnati (simply-sunny).
