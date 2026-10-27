# Changelog

All notable changes to Cue My Music: Downloads are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-27

First release. Requires Cue My Music 1.3.0 or newer.

### Added

- **Search by name**: type a song or artist on the Downloads page. Results come from YouTube Music's song search, official releases first, with covers, and fall back to YouTube if YouTube Music can't be reached.
- **Downloads page** in the player, with progress, Cancel, a tick on songs you already have, and the list of downloaded songs.
- **Downloads into a resource pack** with yt-dlp and ffmpeg, from the Downloads page or `/cmm download <link>`.
- **Playlists**: a playlist link downloads every song (up to 200) and makes a Cue My Music playlist with the same name. Downloading it again adds only the new songs.
- **Delete several downloads at once**: shift-click to select, then press Delete.
- **Sound quality**: songs are encoded at libvorbis quality 10, through `oggenc` when ffmpeg lacks libvorbis.
- **Vanilla music**: with Cue My Music's Vanilla music switch on, the `/cmm download` commands are hidden.
