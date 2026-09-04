# Music Library Organizer Sources and Applied Decisions

This file records external provenance. The user's original skill and known-library mappings remain the primary basis for the workflow; these sources support the safety and interoperability changes in version 2.0.0.

**Last source verification:** 2026-09-04. Re-check Mutagen, ffprobe, MusicBrainz, target-player, and Agent Skills behavior during major revisions.

## Mutagen metadata behavior

- [Mutagen overview](https://mutagen.readthedocs.io/)
  - Lists supported audio containers and tag families, including ID3, MP4, FLAC/Vorbis, APEv2, ASF, AIFF, and WavPack.
- [Mutagen ID3 API](https://mutagen.readthedocs.io/en/latest/api/id3.html)
  - EasyID3 exposes only a registered subset of frames, and ordinary ID3 saves default to ID3v2.4 unless another version is selected deliberately.
- [Mutagen ID3 guide](https://mutagen.readthedocs.io/en/latest/user/id3.html)
  - Mutagen's ID3 API primarily targets ID3v2.4; normal loading/saving can upgrade older tags and transform or discard frames without a valid upgrade path.
- [Mutagen MP4 API](https://mutagen.readthedocs.io/en/latest/api/mp4.html)
  - MP4 text atoms, track/disc tuples, booleans, artwork, and freeform fields have native representations; unknown non-text tags are written back as-is.
- [Mutagen FLAC API](https://mutagen.readthedocs.io/en/latest/api/flac.html)
  - FLAC metadata blocks and pictures require format-specific handling; saving has options that can remove ID3 data and therefore must not be invoked blindly.

**Applied:** detect the actual format, snapshot the complete metadata container, use native writers, preserve unrelated tags/artwork, avoid no-op saves, and make tag-version changes explicit.

## Encoded-audio and stream verification

- [ffprobe documentation](https://ffmpeg.org/ffprobe.html)
  - `-show_data_hash` can hash packet payload data when used with packet inspection.

**Applied:** use full-file hashes for byte-preserving copies and encoded-audio packet-payload digests for retagged files when supported. Fall back to an explicitly weaker technical signature rather than claiming proof that was not obtained.

## Filesystem publication and recovery

- [Python `os.rename`](https://docs.python.org/3/library/os.html#os.rename)
  - Same-filesystem rename is atomic on POSIX, may fail across filesystems, and can silently replace an existing file on Unix.
- [Python `shutil`](https://docs.python.org/3/library/shutil.html)
  - High-level copy helpers cannot preserve every category of filesystem metadata.
- [Linux `renameat2(2)`](https://man7.org/linux/man-pages/man2/rename.2.html)
  - Documents `RENAME_NOREPLACE` for no-clobber publication where the platform supports it.

**Applied:** recheck destinations immediately before publication, prefer explicit no-clobber rename, stage cross-filesystem copies, verify before source removal, retain recovery state on partial failure, and report filesystem metadata that could not be preserved.

## MusicBrainz release and credit semantics

- [MusicBrainz artist-credit style](https://musicbrainz.org/doc/Style/Artist_Credits)
  - Artist credits should generally follow the credit printed or displayed for the release or track, including join phrases.
- [MusicBrainz Picard basic tags](https://picard-docs.musicbrainz.org/en/latest/variables/tags_basic.html)
  - Distinguishes track artist from release artist; documents release date versus original date, track/disc numbers and totals, compilation behavior, and separate MBIDs for release, release group, track, recording, and artists.
- [MusicBrainz Picard tag mapping](https://picard-docs.musicbrainz.org/en/latest/appendices/tag_mapping.html)
  - Shows that the same semantic field uses different physical keys and value types across ID3, Vorbis, APEv2, MP4, ASF, and RIFF.
- [MusicBrainz Web Service](https://musicbrainz.org/doc/MusicBrainz_API)
- [MusicBrainz API rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)
  - The API exposes separate music entities and requires responsible identified, rate-limited access.

**Applied:** identify the exact release edition, preserve credited display text, distinguish track/release/release-group/recording identities, preserve date precision, and add external IDs only after exact verification.

## Jellyfin music interoperability

- [Jellyfin music organization](https://jellyfin.org/docs/general/server/media/music/)
  - Jellyfin expects one album per folder, primarily uses embedded metadata, identifies multi-disc releases through disc metadata, supports adjacent artwork, and requires lyric sidecars to share the audio basename.

**Applied:** retain the portable `Album Artist/Album/` default, keep distinct editions separate, prioritize embedded metadata, and use basename-coupled lyric handling only when Jellyfin is an actual target.

## Pi and Agent Skills structure

- [Pi skills documentation](https://pi.dev/docs/latest/skills)
  - Pi loads skill names and descriptions at startup and the full `SKILL.md` on demand; focused references support progressive disclosure.
- [Agent Skills specification](https://agentskills.io/specification)

**Applied:** make the routing description specific, keep mutation-critical rules in the main file, and move metadata, transaction, mapping, and provenance detail into shallow references.
