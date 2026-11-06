# CurseForge release sheet

CurseForge projects can't be created through the API, so the project is made by hand at [authors.curseforge.com](https://authors.curseforge.com/) with these settings. Files are then uploaded with `scripts/publish-curseforge.py`. The listing body starts after the horizontal rule. It matches `MODRINTH.md` except that mod links point at CurseForge.

## Project settings

| Field | Value |
| --- | --- |
| Name | **Cue My Music: Downloads** |
| Project ID | `1786628` (slug `cue-my-music-downloads`) |
| Class | Mods |
| Summary | Download songs into Cue My Music by name or link. |
| Main category | Utility & QoL |
| License | MIT |
| Project distribution | Don't allow distribution to 3rd party |
| Avatar | `src/main/resources/assets/cuemymusic_downloads/icon.png` |
| Source | https://github.com/simply-sunny/cue-my-music-downloads |
| Issues | https://github.com/simply-sunny/cue-my-music-downloads/issues |
| Wiki | https://simply-sunny.github.io/cue-my-music-downloads/ |

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

An add-on for [Cue My Music](https://www.curseforge.com/minecraft/mc-mods/cue-my-music) that downloads songs into a resource pack.

- You install yt-dlp, ffmpeg and spotdl. The mod doesn't bundle or download them.
- It contacts YouTube Music, and YouTube and iTunes for covers.
- Only download what you have the right to.

Search by name, or paste a song, playlist, artist or Spotify link. Songs play in Cue My Music's Add-ons mode.

## Installation

For Minecraft 26.3 on Fabric or Quilt. Client-side only.

1. Install [Fabric API](https://www.curseforge.com/minecraft/mc-mods/fabric-api).
2. Install [Cue My Music](https://www.curseforge.com/minecraft/mc-mods/cue-my-music) 1.4.0 or newer.
3. Install yt-dlp and ffmpeg:
   - macOS: `brew install yt-dlp ffmpeg vorbis-tools`
   - Windows: `winget install yt-dlp.yt-dlp Gyan.FFmpeg`
   - Linux: `pipx install yt-dlp`, and ffmpeg from your package manager
4. For Spotify links, install spotdl: `pipx install spotdl`.
5. Put the jar in `mods`.

## More

Search, commands and troubleshooting are on the [wiki](https://simply-sunny.github.io/cue-my-music-downloads/).

MIT, see the [LICENSE](https://github.com/simply-sunny/cue-my-music-downloads/blob/main/LICENSE). Minecraft is a trademark of Mojang Studios.
