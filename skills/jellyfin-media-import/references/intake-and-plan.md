# Intake and Operation Manifest

Use for Import and Plan; for scoped maintenance inspect only the named items and applicable checks. No mutation is authorized by this reference.

## Resolve the root and candidate scope

Before any mutation:

1. Use a user-supplied path, resolving a relative path against the current directory.
2. If the user explicitly says “here,” use the canonical current directory.
3. Otherwise require a recognizable marker such as an existing `Movies/`, `Shows/`, or `Animes/` directory. Ask one concise question only if several roots remain plausible.
4. State the canonical absolute root, mode, managed destinations, and requested subtitle languages.

Never infer a parent directory or create destinations while the root is ambiguous.

For **Import** and **Plan**, automatic candidates are limited to:

- non-hidden regular video files immediately under the root;
- non-hidden immediate child directories containing candidate media;
- root-level sidecars tied unambiguously to an in-scope video.

Within one selected release directory, recurse only far enough to inventory that release. Exclude managed destinations and unrelated directories. Inspect existing managed paths only for identity, convention, and collision checks.

Do not follow a symbolic link outside the canonical root or replace a symlink target. Treat symlinked candidates as unresolved unless the user confirms that workflow. Record device and inode information where available so hard-link aliases are detected rather than imported twice.

For a batch, continue with independent, confidently identified items and report the rest. Ask at most one consolidated question before mutation when identity, ordering, destination, or collision handling genuinely requires user input.

## Gate active or incomplete downloads

Never move a candidate that may still be written. Evidence includes:

- a terminal temporary suffix or companion marker such as `.part`, `.partial`, `.crdownload`, `.download`, `.tmp`, `.aria2`, or `.!qB`;
- a downloader resume, lock, or incomplete-state file tied to it;
- a reliable OS check showing it open for writing;
- size, modification time, inode, or directory contents changing between inventory and the immediate pre-mutation check.

Do not use age or one short period of unchanged size as proof. If the root is an active download destination and no reliable completion signal exists, leave the candidate unresolved. Never remove downloader markers. A normal media title containing `Part 1` is not an incomplete marker by itself.

## Defaults and hard boundaries

- Subtitle languages default to English and French. Follow an established valid library suffix style; otherwise use `eng` and `fre`.
- Treat `en`/`eng` as English aliases and `fr`/`fra`/`fre` as French aliases when evaluating tracks. Language identity and filename convention are separate.
- Reuse a suitable complete external or embedded subtitle before retrieving another. A forced-only track does not satisfy full-dialogue coverage.
- Retrieve subtitles only through an authorized provider, configured API/tool, or user-supplied source. Provider failure must not endanger an otherwise safe media import.
- Treat anime movies as movies under `Movies/`; put episodic anime under `Animes/` and use TV-show naming.
- Follow the existing supported metadata-ID convention. If none is clear, prefer a verified TMDB ID for disambiguation.
- Follow the established destination title language and style; otherwise use the verified provider display title without inventing localization.
- Preserve container, video, audio, subtitle streams, chapters, attachments, and quality. Do not transcode, remux, split, concatenate, retime, or edit streams.
- Do not acquire movie or episode files.
- Do not trigger Jellyfin scans, change server/library settings, or use administrator credentials unless separately requested and authorized.
- Do not install missing tools, provider clients, archive utilities, or packages automatically.
- Validate the media operation with `ffprobe`, hashes, path checks, subtitle parsing, and inventory reconciliation—not repository tests, linters, typecheckers, formatters, or builds. A separately requested coding task uses its own verification workflow.

If `ffprobe` is unavailable, report it. Plan mode may return a limited proposal from strong evidence, but Import mode must not mutate media whose type, streams, or identity cannot be established safely.

## Establish identity and media evidence

Before constructing names:

1. Inventory each in-scope video and associated subtitle, artwork, NFO, chapter, checksum, and other sidecar.
2. Preserve every original release and file name for version and subtitle matching.
3. Record canonical path, file type, device/inode where available, byte size, modification time, and relevant permissions.
4. Probe only known local regular files—never remote URLs, playlists, devices, sockets, or archive members.
5. Use `ffprobe` to record duration, video/audio/subtitle streams, language tags, dispositions, chapters, and frame rate where present. Embedded title tags are supporting evidence, not ground truth.
6. Distinguish main media from release samples, trailers, extras, alternate qualities, duplicates, multi-part media, disc structures, and unrelated files. Do not classify from one signal alone.
7. Identify media type, provider title, year, provider ID, season, episode, multi-episode range, split part, special status, and anime ordering.

Recognize `VIDEO_TS` and `BDMV` before classifying their internal files. Disc structures and `.iso` images are **Plan-only** under this skill: document proposed placement and limitations, but leave them untouched.

Use identity evidence in this order:

1. explicit user identity, verifying any supplied provider URL or ID;
2. a verified existing destination series identity and ordering convention;
3. a structurally valid Jellyfin NFO or embedded provider ID that matches the media;
4. the actual page or API response from the selected metadata provider;
5. original release names plus compatible technical metadata;
6. embedded title tags as weak corroboration.

Search-result snippets are not proof. Open the provider result and verify media type, title, year, and ID. Never use filesystem timestamps as release years.

For anime, keep one provider's ordering. Do not convert absolute numbering to seasons or classify an OVA, ONA, short, or special as `Season 00` without a verified mapping.

## Build the operation manifest

Plan the full batch before the first mutation. For each source, record:

- canonical source and stable pre-mutation stat information;
- identified media, provider identity, and confidence basis;
- final destination;
- associated sidecars and extras;
- existing and embedded subtitle status per requested language;
- intended operation: move, copy, reuse, retrieve, skip, or unresolved.

Validate these invariants:

- each source object maps at most once, including hard-link aliases;
- every final path stays under exactly one managed destination;
- no sources converge on one final path;
- exact, case-folded, and Unicode-normalization-equivalent collisions are checked;
- no component exceeds the destination filesystem's limit; never silently truncate;
- no final file would overwrite an existing path;
- a new episode may enter a verified existing series folder, but existing episodes remain untouched;
- an existing movie or competing episode release is a duplicate/version conflict, not an automatic merge or quality decision;
- a byte-identical destination is reported as a duplicate and does not authorize source deletion;
- sidecars move only with media they unambiguously belong to;
- staged copies have enough free destination space.

Show the manifest before execution when mode is **Plan**, identity remains conditional, a conflict or merge decision exists, data would be overwritten or removed, or work exceeds the stated scope. List disc structures/images as untouched blockers. A straightforward collision-free import needs no extra approval.
