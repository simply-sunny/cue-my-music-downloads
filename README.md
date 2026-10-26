<h1 align="center">Cue My Music: Downloads</h1>

<p align="center">An add-on for <a href="https://github.com/simply-sunny/cue-my-music">Cue My Music</a> that saves songs from a link into a resource pack.<br>Fabric &amp; Quilt &nbsp;|&nbsp; 26.3</p>

---

Type `/cmm download <link>` and the song is downloaded with [yt-dlp](https://github.com/yt-dlp/yt-dlp), converted to Ogg with [ffmpeg](https://ffmpeg.org/), and added to a resource pack called **Cue My Music Downloads**. The pack is turned on for you, and the song shows up in the player on that pack's page.

Downloaded songs play from the player only. The game never picks them for its own music.

Only download what you have the right to. Many sites don't allow it in their terms.

## Install

Client-side only.

1. Install [Cue My Music](https://github.com/simply-sunny/cue-my-music) 1.1.0 or newer, with its requirements.
2. Install yt-dlp and ffmpeg. The add-on doesn't download them.

   | System | Command |
   | --- | --- |
   | macOS | `brew install yt-dlp ffmpeg` |
   | Windows | `winget install yt-dlp.yt-dlp Gyan.FFmpeg` |
   | Linux | Your package manager, such as `sudo apt install yt-dlp ffmpeg`. Distro yt-dlp packages are often too old for YouTube; `pipx install yt-dlp` gets the latest. |

3. Put the jar from [Releases](https://github.com/simply-sunny/cue-my-music-downloads/releases) in `mods`.

The add-on looks for both tools on your `PATH`, and in `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`, `/snap/bin`, and `~/.local/bin` (on Windows, WinGet's `Links` folder), since launchers often don't pass on the shell's `PATH`. A tool installed while the game is running is found on the next download.

## Use

| Command | Does |
| --- | --- |
| `/cmm download <link>` | Downloads the song at the link. Progress shows above the hotbar. |
| `/cmm download cancel` | Stops the download. |
| `/cmm downloads` | Lists downloaded songs. Click the pack name to open its folder. |
| `/cmm downloads remove <song>` | Deletes a downloaded song. |

- One download runs at a time. For a link to a video in a playlist, only that video is downloaded.
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

Files are named after the site's video id. Songs are stereo Ogg Vorbis. With ffmpeg's libvorbis that's quality 5 (about 160 kbps); Homebrew's ffmpeg doesn't include libvorbis, so ffmpeg's own Vorbis encoder is used instead, at a similar size.

To remove everything, delete the folder, or turn the pack off under **Options → Resource Packs**.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Couldn't find yt-dlp` or `ffmpeg` | Install it with the command shown. If it's somewhere unusual, link it into `/usr/local/bin` or `~/.local/bin`. |
| `Download failed` from YouTube | Update yt-dlp (`brew upgrade yt-dlp`, `winget upgrade yt-dlp.yt-dlp`, or `yt-dlp -U`). Sites change often. |
| The song isn't in the player | Check that **Cue My Music Downloads** is on under Resource Packs. |

yt-dlp's full output for a failed download is in `.minecraft/logs/latest.log`.

## Develop

Requires JDK 25. `./gradlew build` builds the jar into `build/libs/`. `./gradlew runClient` also loads Cue My Music from `../cue-my-music` if it's been built there; see `gradle.properties`.

## License

MIT, see [LICENSE](LICENSE). Copyright © 2026 Saunak Karnati (simply-sunny).
