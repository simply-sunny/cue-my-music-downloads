# Changelog

All notable changes to Cue My Music: Downloads are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.1] - 2026-11-06

### Changed

- The pack turns on at the bottom of your resource pack list. The mod finds its songs wherever it sits.

## [1.1.0] - 2026-11-06

Requires Cue My Music 1.4.0 or newer.

### Added

- **Artist downloads**: a YouTube channel or artist link, or an **Artist → Download all** card in search results, downloads the whole channel (up to 1000 songs). Songs already in the pack are skipped, so running it again only adds what's new. Cue My Music already groups them by artist, so no playlist is made.
- **Spotify links**, through spotdl: songs, albums, playlists and artists. spotdl only reads the Spotify metadata; the audio comes from a YouTube Music match. Spotify playlists and albums make a Cue My Music playlist named after them. Install spotdl with `pipx install spotdl`; it's optional, and only Spotify links need it.
- **Check uncertain matches**: when a Spotify song's YouTube match isn't clear (a remix, a live version, a different length), the Downloads page shows both and asks **Keep**, **Skip**, or **Skip all** before continuing.
- **Tabs on the Downloads page**, styled as the player's Mode switch: **Find songs** for search, links and progress, and **Downloaded** for the songs already saved, with a box to filter them by title or artist.
- **Song covers**: every song gets its own cover, shown in Cue My Music: its album's cover from iTunes where it has the song, otherwise its YouTube thumbnail cut square. Songs downloaded before get theirs in the background, a few a minute, and thumbnails are swapped for album covers where one is found.
- **More search tools**: sort results by relevance, plays, length or title; **Show more** for up to 30 results; and recent searches as buttons.

### Changed

- Shorter, plainer text: the Downloads page help, chat messages while downloading, and the mod list description.
- Songs are converted to Ogg as each one finishes, not after the whole link, so long artist and playlist downloads use less disk and cancelling keeps the finished songs.
- Spotify songs already in the pack are skipped, like artist downloads.
- The Downloads pack has no picture any more: it looked like a player and stood in as every song's cover.
- Downloading or deleting songs no longer reloads every resource: only the song list is read again, so it's quick and the song that's on keeps playing instead of skipping.

### Fixed

- Downloading outside Add-ons mode says to switch to Add-ons to play the songs.
- The README no longer says downloads play from the player only: Add-ons mode picks them.
- Downloading an artist no longer saves the same song twice when it's on both a single and an album, or is already downloaded.

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
