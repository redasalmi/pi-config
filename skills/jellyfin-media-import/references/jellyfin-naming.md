# Jellyfin Naming Reference

Use this reference when constructing final paths. Preserve a verified existing library convention when it is compatible with Jellyfin; do not rename managed media merely to normalize style.

## Safe path components

Jellyfin documents these characters as problematic in media names:

```text
< > : " / \ | ? *
```

Replace them with a semantically reasonable safe separator. Remove control characters, collapse accidental repeated whitespace, and never create `.` or `..` as a path component. Avoid trailing spaces or periods for cross-platform compatibility.

Before mutation, check exact, case-folded, and Unicode-normalization-equivalent final names. Keep enough distinction that two official titles do not collapse to one path. If a component exceeds the destination filesystem's limit, stop and propose a shorter distinct form; do not silently truncate it.

Use the verified title and release or premiere year. Do not derive a media year from filesystem timestamps.

## Metadata provider IDs

Jellyfin documents identifiers such as:

```text
[tmdbid-569094]
[tvdbid-266189]
[imdbid-tt9362722]
```

Provider IDs may appear in movie or show folder/file names, and multiple IDs are supported. This skill normally follows the existing destination library's valid convention and uses one verified ID. When no convention is clear, prefer a verified TMDB ID for disambiguation.

Validate whether a provider result is a movie or TV entry before using its ID. Do not add an ID inferred only from a search-result snippet or filename.

## Movies

### Single version

```text
Movies/Movie Title (Year) [tmdbid-12345]/
  Movie Title (Year) [tmdbid-12345].mkv
  Movie Title (Year) [tmdbid-12345].eng.srt
  Movie Title (Year) [tmdbid-12345].fre.srt
```

Movies belong in individual folders. For a single ordinary file, the video basename should match the folder basename.

### Multiple versions

Jellyfin groups versions when each filename starts with the parent-folder name exactly, followed by ` - ` and a useful label:

```text
Movies/Movie Title (Year) [tmdbid-12345]/
  Movie Title (Year) [tmdbid-12345] - 2160p.mkv
  Movie Title (Year) [tmdbid-12345] - 1080p.mkv
  Movie Title (Year) [tmdbid-12345] - Director's Cut.mkv
```

The prefix, including year and provider ID, must match the parent folder character-for-character. The space-hyphen-space delimiter is required. Labels should describe a verified resolution, edition, cut, or other meaningful distinction.

Do not merge a new release into an existing movie folder automatically. Adding a second version may require renaming the existing file and can change which version Jellyfin selects by default. Treat it as a conflict unless the user explicitly authorizes version grouping and approves accurate labels.

### Multiple parts

Preserve a verified split movie without concatenating it:

```text
Movies/Movie Title (Year) [tmdbid-12345]/
  Movie Title (Year) [tmdbid-12345]-cd1.mkv
  Movie Title (Year) [tmdbid-12345]-cd2.mkv
```

Jellyfin recognizes part markers including `cd`, `dvd`, `part`, `pt`, `disc`, and `disk` with supported separators. Keep one consistent form and verify that the files are sequential parts of one work rather than alternate versions.

Multiple-part naming does not combine with multiple-version grouping. A subtitle for one part must use that part's exact basename:

```text
Movie Title (Year) [tmdbid-12345]-cd1.eng.srt
```

### Disc structures and images

Recognize intact `VIDEO_TS/` and `BDMV/` trees before treating their internal video files as separate media. A correct Jellyfin layout would preserve the complete tree under one movie folder without renaming internal disc files.

Jellyfin documents that `VIDEO_TS` and `BDMV` do not support multiple versions, multiple parts, or external subtitle/audio tracks. This skill reports the proposed placement and limitations but does not mutate disc structures.

Disc images such as `.iso` are not officially supported. This skill does not move, remux, mount, or extract them. Leave them unresolved and report that Jellyfin recognition is not assured.

## TV series

```text
Shows/Series Title (Year) [tmdbid-12345]/
  Season 01/
    Series Title S01E01 Episode Title.mkv
    Series Title S01E01 Episode Title.eng.srt
    Series Title S01E01 Episode Title.fre.srt
  Season 00/
    Series Title S00E01 Special Title.mkv
```

Use `Season 01`, not `S01`, for a season directory. Pad season numbers consistently and do not mix ordinary episode files directly into the series folder.

Use:

```text
S01E01          one episode
S01E01-E02      one file containing consecutive episodes 1 and 2
S01E03-part-1   the first file of one split episode
S01E03-part-2   the second file of that split episode
```

Do not represent non-consecutive episodes as one range. Jellyfin presents a multi-episode file as one item containing metadata from multiple episodes; this skill does not split it.

Omit an episode title when it cannot be verified. The season and episode marker is the critical identity.

### Specials

Place a provider-recognized special in `Season 00` using that provider's verified `S00Eyy` number. Special numbering can differ between providers. If the selected provider does not assign an episode number, a descriptive filename may remain in `Season 00`; do not invent a number.

### Existing series

When an existing destination series folder is confidently the same series, add the missing season or episode there and preserve its current folder name, title language, and provider-ID style. Never create a parallel series folder solely because a newly generated canonical name differs cosmetically.

A destination file already representing the same season/episode is a collision even when resolution, codec, or release group differs. Do not replace it or select a preferred release automatically.

## Episodic anime

Use TV-show naming under `Animes/`:

```text
Animes/Series Title (Year) [tmdbid-12345]/
  Season 01/
    Series Title S01E01 Episode Title.mkv
```

Keep one metadata provider's ordering for the whole series. Do not translate absolute episode numbers into seasons without a verified mapping. Use `Season 00` for an OVA, ONA, short, or special only when the selected provider classifies it that way.

Anime movies remain under `Movies/` according to this skill's default.

## External subtitle names

An external subtitle's base must exactly match its video. Jellyfin accepts recognized language identifiers and special flags separated by periods. This skill defaults to `eng` and `fre` when the library has no established valid convention:

```text
Video basename.eng.srt
Video basename.eng.sdh.srt
Video basename.eng.forced.srt
Video basename.fre.srt
Video basename.fre.sdh.srt
Video basename.fre.forced.srt
```

Relevant flags include:

- `default` for a default track;
- `forced` or `foreign` for forced content;
- `sdh`, `cc`, or `hi` for hearing-impaired content.

Avoid bare `hi` for hearing-impaired English subtitles because it can be interpreted as the Hindi language identifier. Prefer an explicit language plus `sdh`.

For language comparison, normalize known aliases without changing the content label blindly:

- English: `en`, `eng`;
- French: `fr`, `fra`, `fre`.

Preserve a user-requested regional identifier when Jellyfin recognizes it. Do not infer language, forced status, or hearing-impaired status solely from a filename when content or stream metadata contradicts it.

### Paired bitmap subtitles

A VobSub track consists of an `.idx` control file and matching `.sub` bitmap data. Keep both files with the same video basename, language, and flags:

```text
Video basename.eng.idx
Video basename.eng.sub
```

Do not install or move a lone member as a complete VobSub track. A `.sub` file can also represent a text subtitle format, so inspect its content before classifying it.

## Extras

Jellyfin supports viewer-facing extras in folders such as:

```text
behind the scenes/
deleted scenes/
interviews/
scenes/
samples/
shorts/
featurettes/
clips/
other/
extras/
trailers/
theme-music/
backdrops/
```

Jellyfin also recognizes documented filename and suffix forms for some extras. Use those only when the role is verified.

A scene-release verification sample is not automatically viewer-facing bonus content. Leave it at the source by default. Do not infer an extra solely from short runtime; it could be a short film, special, or episode.

## Artwork and metadata sidecars

Common Jellyfin artwork roles include `poster`, `folder`, `cover`, `backdrop`, `fanart`, `banner`, `logo`, `clearlogo`, `landscape`, and `thumb`, with supported image extensions.

Local artwork can take precedence over fetched artwork. Move it only when its identity and role are unambiguous, and never overwrite an existing image.

Jellyfin recognizes local NFO names such as:

```text
movie.nfo
tvshow.nfo
season.nfo
<episode video basename>.nfo
```

Local NFO metadata can take priority over remote metadata. A scene or release `.nfo` is often release text rather than Jellyfin-compatible XML. Do not rename or install it as metadata unless its structure, media identity, and intended role are verified.

Rename an episode thumbnail, chapter file, or other per-video sidecar only when the association is unambiguous. Preserve unknown sidecars at the source and report them rather than guessing.
