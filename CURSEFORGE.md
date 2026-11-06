# CurseForge release sheet

CurseForge projects can't be created through the API, so the project is made by hand at [authors.curseforge.com](https://authors.curseforge.com/) with these settings. Files are then uploaded with `scripts/publish-curseforge.py`. The listing body starts after the horizontal rule. It matches `MODRINTH.md` except that mod links point at CurseForge.

## Project settings

| Field | Value |
| --- | --- |
| Name | **Cue My Music: Downloads** |
| Project ID | `1786628` (slug `cue-my-music-downloads`) |
| Class | Mods |
| Summary | Find songs by name or link and download them into a resource pack for Cue My Music. |
| Main category | Utility & QoL |
| License | MIT |
| Project distribution | Don't allow distribution to 3rd party |
| Avatar | `src/main/resources/assets/cuemymusic_downloads/icon.png` |
| Source | https://github.com/simply-sunny/cue-my-music-downloads |
| Issues | https://github.com/simply-sunny/cue-my-music-downloads/issues |

## Files

One file per jar, release type `release`. The script sets the version tags and relations:

| JAR | Game versions | Other tags |
| --- | --- | --- |
| `cue-my-music-downloads-26.3-1.1.0.jar` | `26.3` | Fabric, Quilt, Client, Java 25 |

1.1.0 uploaded 2026-11-06 as file `9470398`.

Relations: Cue My Music and Fabric API, both required.

```bash
./gradlew build
python3 scripts/publish-curseforge.py <project-id> --dry-run   # check the tags and metadata
python3 scripts/publish-curseforge.py <project-id>             # uploads; published once CurseForge approves it
```

---

An add-on for [Cue My Music](https://www.curseforge.com/minecraft/mc-mods/cue-my-music) that finds songs by name or link and saves them into a resource pack.

## Before you install

- **Tools you install:** yt-dlp and ffmpeg are required, and spotdl is needed for Spotify links. The mod doesn't include or download them. It runs the copies it finds on your computer.
- **Sites it contacts:** YouTube Music for searches, YouTube for thumbnails, and iTunes for album covers. The tools contact the sites in the links you give them.
- **Only download what you have the right to.** Many sites don't allow it in their terms.

## Features

- **Search:** type a song or artist on the Downloads page of the player. Results come from YouTube Music, official releases first. Slowed, sped-up, lyric and cover uploads go to the bottom unless you search for them.
- **Links:** paste a link on the page, or use `/cmm download <link>`.
- **Playlists:** a playlist link downloads up to 200 songs and makes a Cue My Music playlist with the same name.
- **Artists:** an artist link downloads the channel, up to 1000 songs. Downloading it again adds only the new songs.
- **Spotify:** songs, albums, playlists and artists, through spotdl. spotdl reads the Spotify metadata, and the audio comes from a YouTube Music match. An uncertain match asks Keep, Skip, or Skip all.
- **Covers:** each song gets its album's cover from iTunes where it has the song, otherwise its YouTube thumbnail cut square.
- **Manage:** filter your songs by title or artist, delete one or several, and open the pack's folder.
- **Sound quality:** songs are converted to Ogg Vorbis at quality 10, about 400 kbps.

Songs go into a resource pack called Cue My Music Downloads, which is a normal folder in `resourcepacks`. They play in Cue My Music's Add-ons mode.

## Installation

For Minecraft 26.3.

1. Install Fabric Loader (or Quilt Loader).
2. Install [Fabric API](https://www.curseforge.com/minecraft/mc-mods/fabric-api).
3. Install [Cue My Music](https://www.curseforge.com/minecraft/mc-mods/cue-my-music) 1.4.0 or newer, with its requirements.
4. Install yt-dlp and ffmpeg with the command for your system:
   - **macOS:** `brew install yt-dlp ffmpeg vorbis-tools`
   - **Windows:** `winget install yt-dlp.yt-dlp Gyan.FFmpeg`
   - **Linux:** your package manager, or `pipx install yt-dlp` for the latest yt-dlp.
5. For Spotify links, install spotdl: `pipx install spotdl`.
6. Put the jar in `mods`.

## Compatibility

- **Minecraft:** 26.3 on Fabric and Quilt. Java 25.
- **Client-side only.** Servers don't need it.
- **One download at a time.**
- **Live streams and anything over an hour** are skipped.
- **Add-ons mode only.** Vanilla + FX leaves downloaded songs out.

The full guide and troubleshooting are on [GitHub](https://github.com/simply-sunny/cue-my-music-downloads#readme).

## License

MIT, see the [LICENSE](https://github.com/simply-sunny/cue-my-music-downloads/blob/main/LICENSE). Minecraft is a trademark of Mojang Studios.
