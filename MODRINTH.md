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
| Summary | Download songs into Cue My Music by name or link. |
| License | MIT |
| Environment | Client-side only (`client_only`) |
| Featured categories | `utility` |
| Source | https://github.com/simply-sunny/cue-my-music-downloads |
| Issues | https://github.com/simply-sunny/cue-my-music-downloads/issues |
| Wiki / docs | https://simply-sunny.github.io/cue-my-music-downloads/ |
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
| `cue-my-music-downloads-26.3-1.1.1.jar` | `KWk4ZuLF` |

| JAR | Modrinth `game_versions` |
| --- | --- |
| `cue-my-music-downloads-26.3-1.1.0.jar` | `26.3` |
| `cue-my-music-downloads-26.3-1.1.1.jar` | `26.3` |

Version name format: `Cue My Music: Downloads 1.1.0 (26.3)`.

### Dependencies

| Project | ID | Type |
| --- | --- | --- |
| Cue My Music | `dCISwMOO` | Required |
| Fabric API | `P7dR8mSH` | Required |

Mod Menu isn't listed: the add-on doesn't use it, and Cue My Music already requires it.

---

An add-on for [Cue My Music](https://modrinth.com/mod/cue-my-music) that downloads songs into a resource pack.

- You install yt-dlp, ffmpeg and spotdl. The mod doesn't bundle or download them.
- It contacts YouTube Music, and YouTube and iTunes for covers.
- Only download what you have the right to.

Search by name, or paste a song, playlist, artist or Spotify link. Songs play in Cue My Music's Add-ons mode.

## Installation

For Minecraft 26.3 on Fabric or Quilt. Client-side only.

1. Install [Fabric API](https://modrinth.com/mod/fabric-api).
2. Install [Cue My Music](https://modrinth.com/mod/cue-my-music) 1.4.0 or newer.
3. Install yt-dlp and ffmpeg:
   - macOS: `brew install yt-dlp ffmpeg vorbis-tools`
   - Windows: `winget install yt-dlp.yt-dlp Gyan.FFmpeg`
   - Linux: `pipx install yt-dlp`, and ffmpeg from your package manager
4. For Spotify links, install spotdl: `pipx install spotdl`.
5. Put the jar in `mods`.

## More

Search, commands and troubleshooting are on the [wiki](https://simply-sunny.github.io/cue-my-music-downloads/).

MIT, see the [LICENSE](https://github.com/simply-sunny/cue-my-music-downloads/blob/main/LICENSE). Minecraft is a trademark of Mojang Studios.
