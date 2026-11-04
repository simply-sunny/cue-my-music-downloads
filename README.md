<h1 align="center">Cue My Music: Downloads</h1>

<p align="center">An add-on for <a href="https://github.com/simply-sunny/cue-my-music">Cue My Music</a> that finds songs by name or link and saves them into a resource pack.<br>Fabric &amp; Quilt &nbsp;|&nbsp; 26.3</p>

---

Search for a song by name on the **Downloads** page of the player, or paste a link there or into `/cmm download <link>`, and the song is downloaded with [yt-dlp](https://github.com/yt-dlp/yt-dlp), converted to Ogg with [ffmpeg](https://ffmpeg.org/), and added to a resource pack called **Cue My Music Downloads**. The pack is turned on for you, and the song shows up on the add-on's **Downloads** page in the player.

A playlist link downloads the whole playlist (up to 200 songs) and makes a Cue My Music playlist with the same name. An artist link downloads the artist's channel (up to 1000 songs) and adds them under the artist that Cue My Music already groups them by; downloading the artist again adds only the new songs. Spotify songs, albums, playlists and artists work too, through [spotdl](https://github.com/spotDL/spotify-downloader), which reads the Spotify metadata while the audio still comes from YouTube.

Downloaded songs are add-on songs: they play in Cue My Music's **Add-ons** mode, which picks them in place of the game's music. **Vanilla + FX** leaves them out.

Only download what you have the right to. Many sites don't allow it in their terms.

## Install

Client-side only.

1. Install [Cue My Music](https://github.com/simply-sunny/cue-my-music) 1.3.0 or newer, with its requirements.
2. Install yt-dlp and ffmpeg. The add-on doesn't download them.

   | System | Command |
   | --- | --- |
   | macOS | `brew install yt-dlp ffmpeg vorbis-tools` |
   | Windows | `winget install yt-dlp.yt-dlp Gyan.FFmpeg` |
   | Linux | Your package manager, such as `sudo apt install yt-dlp ffmpeg`. Distro yt-dlp packages are often too old for YouTube; `pipx install yt-dlp` gets the latest. |

3. Put the jar from [Releases](https://github.com/simply-sunny/cue-my-music-downloads/releases) in `mods`. For Spotify links, also install spotdl: `pipx install spotdl` (or `pip install spotdl`).

The add-on looks for all three tools on your `PATH`, and in `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`, `/snap/bin`, and `~/.local/bin` (on Windows, WinGet's `Links` folder), since launchers often don't pass on the shell's `PATH`. A tool installed while the game is running is found on the next download. spotdl is optional; only Spotify links need it.

## Use

Open the player and click **Downloads** in the library. The page has two tabs: **Download** for finding songs, and **Downloads** for the songs already saved.

On **Download**, type a song or artist and press Enter or **Search**. Songs come from YouTube Music's song search, official releases first: the top result as a card with its cover, then the rest with title, artist, album and length. Slowed, sped-up, lyric, cover and similar uploads go to the bottom unless you search for them. Click **Download** on the top result, or the arrow on a row; songs you already have show a tick, and a song being downloaded shows its progress. **Sort** reorders the results by relevance, plays, length or title, and **Show more** asks for up to 30 results. Past searches stay as buttons for the session. When the search is about an artist, an **Artist** card comes first, with **Download all** for their whole channel. **Clear** hides the results. If YouTube Music can't be reached, yt-dlp searches YouTube instead. To download from a link instead, paste it and press Enter or **Download**. The tab shows the download's progress and has **Cancel** while it runs. If yt-dlp or ffmpeg is missing, it says which and shows the command to install it.

On **Downloads**, your songs are listed below a filter box: type to narrow them by title or artist. Right-click a song and pick **Delete download** to remove it, or select several (shift-click) and press Delete. **Open folder** opens the pack's folder. A running download's progress shows on this tab too.

Spotify links are read with spotdl, then each song is matched to a YouTube Music result. A match that isn't clear (a remix, a live version, a different length) is shown with both titles, artists and lengths, and asks **Keep**, **Skip**, or **Skip all**; the download waits until you answer. **Skip all** skips the rest of the uncertain matches in that link. Everything else downloads without asking. A Spotify playlist or album makes a Cue My Music playlist named after it; a Spotify artist adds the songs to that artist, like a YouTube artist link.

The same things work from chat:

| Command | Does |
| --- | --- |
| `/cmm download <link>` | Downloads the song, or every song in a playlist, artist channel or Spotify link. Progress shows above the hotbar. When a Spotify match needs checking, the Downloads page asks Keep or Skip. |
| `/cmm download cancel` | Stops the download, and answers the match question with Skip. |
| `/cmm downloads` | Lists downloaded songs. Click the pack name to open its folder. |
| `/cmm downloads remove <song>` | Deletes a downloaded song. |

- One download runs at a time.
- A video link that also names a playlist (`watch?v=…&list=…`) downloads just the video. Use the playlist's own link (`playlist?list=…`) for all of it.
- Videos in a playlist that can't be downloaded (private, removed, region-locked) are skipped, and chat says how many.
- Cancelling keeps the songs that had finished.
- Spotify links need spotdl. Without it, the page and chat say how to install it.
- Spotify matching searches YouTube Music, so a song that isn't on YouTube (or is there under a very different title) is reported as not found.
- Live streams and anything over an hour are skipped.
- The title is the track name if the site has one, else the video title. The artist is the site's artist, else the uploader (YouTube's "Artist - Topic" channels become "Artist"). Spotify downloads keep Spotify's title, artist and album.
- Downloading the same song again replaces the old copy. Artist and Spotify links skip songs already in the pack.

Downloaded songs play in Add-ons mode only. With Cue My Music's defaults they also:

- **Automix:** play at matched loudness and blend into the next downloaded song over up to 8 seconds.
- **Stay out of recordings:** play from a separate process, so a recorder of the game's own audio (rec-util, or OBS's application audio capture) leaves them out, while game music and discs are still recorded. Recorders of all system audio still pick them up.

Both are in Cue My Music's **Settings** (**Automix add-on songs**, **Keep add-on songs out of recordings**).

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
| `Couldn't find spotdl`, or a Spotify link says it needs it | Install it with `pipx install spotdl`. The add-on looks in `~/.local/bin` too. |
| A Spotify song matched the wrong video | Press **Skip** at the question. To skip every uncertain match in the link, press **Skip all**. |
| `Download failed` from YouTube | Update yt-dlp (`brew upgrade yt-dlp`, `winget upgrade yt-dlp.yt-dlp`, or `yt-dlp -U`). Sites change often. |
| The song isn't in the player | Check that **Cue My Music Downloads** is on under Resource Packs. |

yt-dlp's full output for a failed download is in `.minecraft/logs/latest.log`.

## Develop

Requires JDK 25 and a built Cue My Music in `../cue-my-music` (`./gradlew buildAll` there), which the add-on compiles against for playlists; see `gradle.properties`. Then `./gradlew build` builds the jar into `build/libs/`.

## License

MIT, see [LICENSE](LICENSE). Copyright © 2026 Saunak Karnati (simply-sunny).
