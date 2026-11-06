# Modrinth release sheet

This file is the source of truth for the Modrinth project settings, version metadata, and listing body. The listing body starts after the horizontal rule.

## Project settings

| Field | Value |
| --- | --- |
| Title | **Cue My Music: Downloads** |
| Slug | `cue-my-music-downloads` |
| Project type | Mod |
| Project ID | `Ok613vDc` (submitted for review 2026-11-06) |
| CurseForge project ID | `1786628` (slug `cue-my-music-downloads`), uploaded with `scripts/publish-curseforge.py` |
| Summary | Find songs by name or link and download them into a resource pack for Cue My Music. Uses yt-dlp and ffmpeg, which you install. Fabric and Quilt 26.3, client-side. |
| License | MIT |
| Environment | Client-side only (`client_only`) |
| Featured categories | `utility` |
| Source | https://github.com/simply-sunny/cue-my-music-downloads |
| Issues | https://github.com/simply-sunny/cue-my-music-downloads/issues |
| Wiki / docs | https://github.com/simply-sunny/cue-my-music-downloads#use |
| Discord | *(none)* |
| Donation links | *(none)* |
| Icon | `src/main/resources/assets/cuemymusic_downloads/icon.png` (512×512) |
| Gallery | *(none yet)* |
| Disclosures | External system interactions, AI-generated content (code). Set in the web settings, before submitting. |

## Version metadata

Upload one Modrinth version per JAR, version number as in `gradle.properties`, channel `release`, loaders `fabric` and `quilt`, environment `client_only`.

| JAR | Version ID |
| --- | --- |
| `cue-my-music-downloads-26.3-1.1.0.jar` | `it4J5ixA` |

| JAR | Modrinth `game_versions` |
| --- | --- |
| `cue-my-music-downloads-26.3-1.1.0.jar` | `26.3` |

Version name format: `Cue My Music: Downloads 1.1.0 (26.3)`.

### Dependencies

| Project | ID | Type |
| --- | --- | --- |
| Cue My Music | `dCISwMOO` | Required |
| Fabric API | `P7dR8mSH` | Required |

Mod Menu isn't listed: the add-on doesn't use it, and Cue My Music already requires it.

---

An add-on for [Cue My Music](https://modrinth.com/mod/cue-my-music) that finds songs by name or link and saves them into a resource pack.

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
2. Install [Fabric API](https://modrinth.com/mod/fabric-api).
3. Install [Cue My Music](https://modrinth.com/mod/cue-my-music) 1.4.0 or newer, with its requirements.
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
