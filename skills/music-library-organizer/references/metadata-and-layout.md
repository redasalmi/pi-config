# Music Metadata and Library Layout

Use this reference whenever folder organization, filename cleanup, or embedded tag editing is in scope. Apply only the sections relevant to the requested files and target player.

## Release model before folder model

Distinguish:

- **Recording** — the underlying performance or mix.
- **Track** — one recording's position and credit on a particular release medium.
- **Release edition** — the exact issued album, single, EP, compilation, promo, reissue, remaster, deluxe edition, or digital release represented by the files.
- **Release group** — related editions of the same broad album/single concept; too broad for exact track order, date, or folder merging.

Folder grouping and release-level tags must follow the exact release edition when it can be established. Do not merge files merely because they share an album title or release group.

## Portable folder hierarchy

Prefer an established coherent convention. When the library has none, use:

```text
Album Artist/
  Album/
    audio files and release sidecars
```

Use the release's credited album artist for the top-level grouping. Examples include one artist, a credited collaboration, a soundtrack composer/artist, or `Various Artists` for a true various-artists release. Do not group a compilation under each track performer.

One album folder must represent one release edition. Disambiguate only when necessary, using confirmed existing convention such as:

```text
Album (Year)
Album [Deluxe Edition]
Album (Year) [Catalog Number]
```

Do not add year, label, catalog number, format, source, or mastering text unless it identifies the represented edition and matches the library's policy.

An existing artist folder is normal. An existing album folder can be a safe merge target only when:

- both sets are confirmed as the same release edition;
- album artist, album title, edition, disc count, and numbering model agree;
- missing tracks fit unused logical positions;
- no filename, sidecar, artwork, checksum, or normalization-equivalent collision exists;
- no competing encoding or version decision is being made silently.

Otherwise keep the release separate and report the conflict.

## Multi-disc releases

Use one common album and album-artist identity for the release. Embedded disc number and total-disc metadata are authoritative for compatible players.

All discs may live in one album folder. Preserve established `Disc 1`, `CD1`, or similar subfolders when coherent; do not create or flatten disc folders without the requested layout policy.

Track totals normally refer to tracks on that medium/disc, not necessarily the whole release. Never encode an unknown total as zero. Write a number without a total when only the number is verified.

Disc subtitles, medium names, bonus discs, and data discs are distinct from the album title. Preserve them when represented in existing metadata or exact-release evidence.

## Artist credits

- `artist` represents the track artist credit.
- `albumartist` represents the release artist credit.
- Preserve the credited display text and join phrases such as `feat.`, `with`, `&`, `and`, or localized equivalents when verified.
- Do not split or join artists merely by parsing commas, ampersands, slashes, or semicolons.
- Preserve multi-value artist tags where the format and existing convention support them.
- Put standardized sort forms in sort tags, not display tags.

A featured track on a single-artist album does not turn the album into a `Various Artists` compilation. Set a compilation flag only for the target format's established semantics and a genuinely qualifying release.

## Field policy

### Identity fields

For a conventional album track, populate when verified:

- title;
- track artist;
- album/release title;
- album/release artist;
- track number and disc number where release order is known.

Standalone recordings, anonymous captures, sound effects, user-created clips, and incomplete releases may legitimately omit album, album artist, numbering, or date. Do not hide uncertainty with placeholder identities unless the user has defined a library-specific convention.

### Dates

Preserve existing precision. Valid evidence may support `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`; do not reduce a full date to a year.

Keep the represented edition's issue date in the normal release-date field. Store an earliest/original release date separately only when the format/convention supports it and the value is verified. Do not replace a reissue's edition date with the earliest release-group date.

### Genres

Genre is optional and subjective. Preserve existing credible values and multiplicity. Add or correct it only when the user requested genre work and the value is supported by an official/label classification, a strong catalog consensus, or a library-specific verified mapping. Do not force one genre per file or infer genre from artist nationality, instrumentation, filename, or neighboring unrelated releases.

### Titles and versions

Preserve meaningful version information such as:

- live venue/date when part of the credited title;
- demo, radio edit, extended mix, remix, instrumental, acoustic, remaster, mono/stereo, or explicit edition text;
- movement or work information for classical material.

Do not strip parenthetical text merely because it resembles a source suffix. Remove download-site, video-platform, codec, bitrate, or release-group clutter from a title only when the filename evidence clearly separates it from the credited title and cleanup is requested.

### External identifiers

Preserve valid existing identifiers. Add only exact verified values, including:

- MusicBrainz release, release-group, track, recording, and artist IDs;
- Discogs release ID;
- ISRC;
- barcode, catalog number, label, and release country;
- AcoustID only through an authorized workflow.

Do not copy an identifier between editions, recordings, tracks, or artists because the visible title matches.

### Classical and other structured music

Preserve composer, conductor, orchestra/ensemble, soloist/performer, work, movement, movement number/count, grouping, opus/catalog information, and sort tags. Do not collapse these into pop-style `artist - title` fields or rewrite an existing classical schema without a dedicated user instruction.

## Format-aware tag writing

Always load the full tag container before editing and compare it after saving.

### MP3 and other ID3-tagged files

Use the full ID3 API when preserving arbitrary frames matters. Record the original ID3 version. Mutagen's normal ID3 workflow targets v2.4 and can upgrade or transform older frames when saving.

- Do not save a file that needs no change.
- Preserve v2.3 when the library/client requires it by using an explicit v2.3 save path.
- If an edit would unavoidably upgrade v2.2 or discard an unrepresentable frame, leave it unresolved unless the user accepts that conversion.
- Preserve APIC artwork, USLT/SYLT lyrics, COMM comments, POPM/rating data, TXXX custom fields, UFID identifiers, ReplayGain/R128 fields, and unknown frames.
- Do not remove ID3v1 merely as cleanup unless requested and compatibility has been considered.

### MP4/M4A/ALAC

Use MP4's native atom types:

- text atoms are lists of strings;
- track and disc numbers are integer tuples;
- compilation and gapless flags are booleans;
- cover artwork is binary `covr` data;
- custom metadata may use freeform atoms.

Use the full MP4 API when EasyMP4 cannot expose every field that must be preserved. Keep unknown atoms, chapters, artwork, sort fields, gapless data, and freeform identifiers intact.

### FLAC, Ogg Vorbis, and Ogg Opus

Preserve Vorbis-comment key multiplicity, existing key spelling convention, pictures, cue sheets/seek tables/application blocks, ReplayGain/R128 fields, and unknown metadata blocks. Do not delete embedded ID3 data or non-comment blocks as a side effect of saving.

### WAV and AIFF

Treat ID3-bearing WAV/AIFF as format-specific containers, not generic MP3 files. Confirm that Mutagen can parse and safely write the exact file before Apply. Preserve RIFF/FORM structure, audio parameters, and non-ID3 chunks. Unsupported or unusual metadata remains read-only.

### Other formats

Mutagen supports additional containers, but support is not permission to edit blindly. Build and validate a format adapter for the fields in scope. If the writer cannot round-trip full metadata and audio safely, inventory the file and report it as read-only.

## Filename cleanup

Filename cleanup is independent from tag repair. Follow the existing album convention. If none exists, present a proposed template in Plan rather than choosing silently.

A viable template normally contains enough ordering information for human use, for example a track number and title, with a disc prefix for multi-disc releases. Whatever template is selected:

- preserve the extension exactly;
- preserve official title/version text and Unicode;
- do not transliterate unless requested;
- remove only characters illegal for the target filesystem or target-player policy;
- check case-folded and Unicode-normalization-equivalent collisions;
- do not silently truncate long names;
- rename per-track lyrics, artwork, or cue references only when their association is exact and that sidecar change is authorized.

Jellyfin generally identifies music from embedded metadata and expects each album in one folder. Its lyric sidecars must share the audio filename basename. Apply those details only when Jellyfin is an actual target, not as universal player behavior.

## Sidecars and checksums

Preserve release material such as:

- cover/folder/front/back/disc artwork;
- booklet PDFs and scans;
- rip logs, AccurateRip data, cue sheets, and checksums;
- synchronized or plain lyric sidecars;
- playlists and local metadata files.

A checksum describing original release filenames may become historically stale after a requested rename. Do not regenerate or delete it silently; preserve it and report the consequence unless checksum maintenance is explicitly requested.
