# Sources and Applied Decisions

This file records provenance for the skill. Routine imports do not need to load it.

**Last source verification:** 2026-09-04. Re-check Jellyfin naming behavior, metadata providers, and subtitle-provider access rules during major revisions.

## Jellyfin organization and naming

- [Jellyfin: Movies](https://jellyfin.org/docs/general/server/media/movies/)
  - Documents one-folder-per-movie organization, matching folder/file basenames, problematic filename characters, provider IDs, external track flags, multiple versions, multi-part files, disc structures, extras, and artwork names.
- [Jellyfin: TV Shows](https://jellyfin.org/docs/general/server/media/shows/)
  - Documents series/season organization, `Season` folder naming, `SxxEyy`, multi-episode and split-episode files, external tracks, extras, and `Season 00` specials.
- [Jellyfin: Metadata Provider Identifiers](https://jellyfin.org/docs/general/server/metadata/identifiers/)
  - Documents `[tmdbid-*]`, `[tvdbid-*]`, and `[imdbid-*]` syntax and the supported providers.
- [Jellyfin: Local NFO Metadata](https://jellyfin.org/docs/general/server/metadata/nfo/)
  - Documents recognized NFO filenames and notes that local NFO metadata takes priority over remote provider metadata.
- [Jellyfin: Excluding Files and Directories](https://jellyfin.org/docs/general/server/media/excluding-directory/)
  - Documents `.ignore` behavior. The skill does not rely on it for transactional copies because an incomplete transfer should never appear under a final media/subtitle name, and `.ignore` interpretation differs across Jellyfin versions.

**Applied:** sanitize all documented problematic characters; preserve compatible existing library conventions; use verified provider identity and ordering; distinguish single versions, multiple versions, multiple parts, disc structures, specials, and extras; avoid promoting arbitrary release NFO/artwork; and never expose a partial copy as final media.

## Subtitle behavior

- [Jellyfin: Movies — External Subtitles and Audio Tracks](https://jellyfin.org/docs/general/server/media/movies/#external-subtitles-and-audio-tracks)
  - Documents basename matching, language/title fields, and `default`, `forced`/`foreign`, and `sdh`/`cc`/`hi` flags.
- [Jellyfin: Codec Support — Subtitle Compatibility](https://jellyfin.org/docs/general/clients/codec-support/#subtitle-compatibility)
  - Documents SRT, VTT, ASS/SSA, VobSub, and PGS support considerations and notes that subtitles can cause conversion or burn-in depending on container and client.
- [Jellyfin source: ExternalPathParser tests](https://github.com/jellyfin/jellyfin/blob/master/tests/Jellyfin.Naming.Tests/ExternalFiles/ExternalPathParserTests.cs)
  - Demonstrates external subtitle suffix parsing, semantic flags, and language aliases including `en`/`eng` and `fr`/`fre`/`fra`.
- [Jellyfin source: MediaInfoResolver tests](https://github.com/jellyfin/jellyfin/blob/master/tests/Jellyfin.Providers.Tests/MediaInfo/MediaInfoResolverTests.cs)
  - Demonstrates external-file basename matching and metadata/filename resolution behavior.
- [Jellyfin: Plugins](https://jellyfin.org/docs/general/server/plugins/)
  - Documents the Open Subtitles and Subtitle Extract plugins and per-library subtitle language configuration.
- [OpenSubtitles REST API: Getting Started](https://opensubtitles.stoplight.io/docs/opensubtitles-api/e3750fd63a100-getting-started)
  - Documents official API access, authentication, and provider-controlled download behavior.

**Applied:** preserve exact video basenames; normalize known aliases only for comparison; separate complete, forced, and hearing-impaired tracks; treat VobSub `.idx`/`.sub` as a pair; prefer text subtitles when retrieval is needed; use an authorized plugin/client or official API; respect credentials and quotas; and avoid claiming client compatibility or synchronization without direct evidence.

The `eng` and `fre` suffixes are user-library defaults retained from version 1.1.1, not a claim that Jellyfin requires those exact codes. The workflow recognizes common English/French aliases when inspecting streams and preserves an established valid destination convention.

## Media inspection

- [FFmpeg: ffprobe Documentation](https://ffmpeg.org/ffprobe.html)
  - `ffprobe` reports container, stream, metadata, chapter, disposition, duration, and frame-rate information in machine-readable formats.
  - It accepts URLs as inputs, so the skill limits probing to known local regular files.

**Applied:** inventory stream and runtime signatures before moving; use `ffprobe` as supporting evidence rather than title ground truth; and compare signatures after transfer without transcoding.

## Filesystem and archive safety

- [POSIX `rename()`](https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html)
  - Defines same-filesystem rename behavior and `EXDEV` for cross-filesystem operations.
- [Linux `renameat2()` manual](https://man7.org/linux/man-pages/man2/rename.2.html)
  - Documents `RENAME_NOREPLACE`, which fails rather than replacing an existing destination when supported.
- [Python `shutil`](https://docs.python.org/3/library/shutil.html)
  - Documents copy/move behavior and warns that high-level copy functions do not preserve every kind of metadata.
- [Python `zipfile`](https://docs.python.org/3/library/zipfile.html)
  - Warns against extracting untrusted archives without inspecting members and paths.
- [OWASP: Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)
  - Describes traversal through absolute paths and parent components and recommends normalization and strict containment.

**Applied:** use no-clobber final publication; treat cross-filesystem moves as verified copy-then-remove transactions; compare bytes before deleting a source; normalize and contain every source, destination, and archive member; reject links/devices/traversal in archives; and never use broad recursive deletion for release cleanup.

The active-download gate is a conservative operational safeguard: known partial markers, open-for-write evidence, or a changing source prevent mutation. File age alone is deliberately not treated as proof.

## Skill structure and routing

- [Agent Skills specification](https://agentskills.io/specification)
  - Defines required frontmatter, metadata constraints, relative references, validation, and progressive disclosure.
- [Pi Skills documentation](https://pi.dev/docs/latest/skills)
  - Explains that descriptions determine on-demand skill selection and recommends specific routing metadata.

**Applied:** keep the mutation workflow in `SKILL.md`; move detailed naming and subtitle procedures into focused one-level references; and exclude server administration, playback troubleshooting, transcoding, media acquisition, and broad library cleanup from automatic routing.
