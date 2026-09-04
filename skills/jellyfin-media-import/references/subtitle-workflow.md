# External Subtitle Acquisition and Validation

Use this reference when an import requests external subtitles, a requested language is missing, or a supplied subtitle needs classification. Subtitle acquisition is best-effort: a provider failure must not turn a verified media move into data loss.

## Establish the request and existing coverage

For each final video, record the requested languages and whether the user requires external text subtitles or merely usable subtitle coverage.

Inspect separately:

- external subtitle files already accompanying the release;
- external subtitle files already beside an existing destination video;
- embedded subtitle streams, including language, title, codec, disposition, and forced/hearing-impaired flags;
- paired bitmap subtitle files such as VobSub `.idx`/`.sub`.

Normalize known language aliases only for comparison. Preserve the destination library's valid filename convention when naming a new file. For this skill's defaults:

- English: `en`, `eng`;
- French: `fr`, `fra`, `fre`.

Do not infer a language from a release flag alone when stream metadata or sampled text contradicts it. An unknown or missing language tag is unresolved until the content can be identified reliably.

Classify coverage per requested language:

- **Complete external** — a trustworthy full-dialogue external track exists.
- **Complete embedded** — a trustworthy full-dialogue embedded track exists and the user did not require external text.
- **Forced only** — covers foreign dialogue or signs, not the full program.
- **SDH/CC only** — full dialogue with hearing-impaired cues; valid coverage but distinct from a standard subtitle.
- **Unsuitable format/client path** — content exists, but an evidenced client constraint requires an external text alternative.
- **Missing or unresolved** — no trustworthy matching track is established.

Prefer a complete existing track over another download. Do not remove or replace a valid forced or SDH variant merely because a standard track is added.

## Preserve the original release identity

Search before discarding or normalizing the original release name. Record useful tokens such as:

- title and year;
- season, episode, absolute anime number, special, or part;
- edition or cut;
- source or service;
- resolution and video codec;
- release group;
- runtime and frame rate;
- provider ID;
- file hash when an authorized subtitle provider supports hash matching.

Use technical tokens as compatibility evidence, not as proof of title or language.

## Candidate priority

Prefer candidates in this order:

1. a trustworthy subtitle delivered with the same release;
2. an authorized provider's exact file-hash match;
3. an exact normalized release-name match;
4. the same title/provider ID, season/episode or part, edition/cut, source, release group, runtime, and frame rate;
5. another reputable candidate whose content and timing can be directly validated.

For a movie version or multipart item, match the exact version/part rather than only the parent title. For anime, use the same ordering provider selected for the video; do not assume an absolute episode number equals a season episode.

A matching runtime or FPS does not prove synchronization. A subtitle can target a different edit with the same nominal runtime. Report the actual match basis.

## Provider and credential boundary

Use only:

- a subtitle already supplied by the user or release;
- a configured subtitle client or Jellyfin plugin;
- an official or documented API for which the environment is authorized;
- another source the user explicitly authorizes and that can provide the subtitle without bypassing access controls.

Respect authentication, request limits, download quotas, and provider terms. Do not:

- scrape arbitrary subtitle sites when no supported download path exists;
- bypass CAPTCHAs, logins, rate limits, or signed-URL controls;
- expose API keys, passwords, session cookies, authorization headers, or signed download URLs in commands, logs, or the final report;
- ask the user to paste a reusable secret into chat or shell history;
- install a provider client, browser extension, archive utility, or package automatically.

When credentials or a supported provider are unavailable, report the exact missing capability and continue the safe media import.

## Stage the payload safely

Download or copy a candidate into a unique temporary file outside the final subtitle name. Keep the final directory on the same filesystem when possible so the validated payload can be committed with a no-clobber rename.

Before opening or extracting it:

- inspect the response status and headers when available;
- verify the payload is not an HTML login/error page, JSON error, executable, script, or installer;
- compare the detected content type with the advertised filename;
- reject zero-byte, obviously truncated, or implausibly large payloads;
- record the provider/candidate identity without retaining secret query parameters.

Never execute a downloaded payload.

## Inspect archives before extraction

Use an archive format only when an existing trusted utility can list and extract it safely. Inspect all members before extraction.

Reject an archive that contains:

- absolute paths, drive-qualified paths, `..` traversal, or members escaping the staging directory;
- symbolic or hard links;
- executables, scripts, installers, device nodes, or unrelated binary payloads;
- nested archives that cannot be inspected safely;
- a disproportionate member count or expanded size for a subtitle download;
- encrypted members when no authorized, non-secret workflow was supplied.

Extract only the selected subtitle members into a dedicated staging directory. Do not extract over existing files. Delete only temporary files created by this run after their outcome is known.

## Supported payloads

Prefer text subtitles that can be inspected directly:

- SubRip `.srt`;
- Advanced SubStation Alpha `.ass`;
- SubStation Alpha `.ssa`;
- WebVTT `.vtt`.

Preserve a valid existing format rather than converting it without need. Do not rename a file extension to claim another format.

VobSub is a paired bitmap format:

```text
Video basename.eng.idx
Video basename.eng.sub
```

Both members are required and must belong to the same track. A lone `.idx` or bitmap `.sub` is incomplete. A `.sub` file can also be a text subtitle, so identify its actual content before treating it as VobSub.

Do not extract, OCR, translate, or rewrite graphical subtitles in this workflow.

## Validate identity and language

For every candidate:

1. Confirm that title, movie/show type, season/episode, special, version, or part matches the final video.
2. Sample enough dialogue to establish the requested language when metadata is absent or unreliable.
3. Confirm that a file marked forced contains forced/foreign-dialogue content rather than a full transcript.
4. Confirm that SDH/CC labeling is retained when speaker labels, sound cues, or other hearing-impaired content are present.
5. Reject obvious wrong-title, wrong-episode, wrong-language, commentary-only, advertisement-only, or unrelated files.
6. Reject obvious machine translation unless the user explicitly accepts it. Do not claim human translation quality from a filename or provider label.

Do not remove translator credits or edit dialogue to make a candidate appear acceptable.

## Validate structure and encoding

### SRT

Confirm that cues contain valid time ranges and text. Sequence numbers may be absent or imperfect, so do not reject an otherwise valid track solely for numbering. Reject impossible timestamps, pervasive malformed cue boundaries, or content that cannot be parsed reliably.

### ASS/SSA

Confirm that the script has recognizable sections and valid event rows. Preserve styles, positioning, signs, and metadata. Do not flatten it to SRT unless the user explicitly requests conversion and accepts the loss.

### WebVTT

Confirm the `WEBVTT` signature and valid cue timing. Preserve supported cue settings rather than stripping them blindly.

### Encoding

Detect the existing encoding. Convert text to UTF-8 only when the conversion is lossless. Preserve a UTF-8 BOM only when required by the existing workflow; do not introduce corruption while normalizing line endings or metadata.

## Validate timing honestly

Perform these checks where practical:

- the first and last valid cue fall broadly within the video runtime;
- cue timestamps are ordered enough to parse; legitimate overlaps are not automatically errors;
- the candidate's edition, source, release group, runtime, and frame rate are compatible;
- early, middle, and late cues are spot-checked against playback or audio when a playback-capable tool is available.

A subtitle ending before the video can be correct because credits may have no dialogue. A subtitle that starts after an intro can also be correct. Use content synchronization, not endpoint equality alone.

Classify timing evidence as:

- **Directly checked** — representative cues were compared with playback/audio.
- **Exact release/hash basis** — strong release evidence exists, but playback was not checked.
- **Compatibility only** — runtime/FPS/edition appear compatible, but synchronization remains unverified.

Never report “synced” or “timing verified” for the latter two classifications.

## Construct the final name

Use the exact final video basename, then the resolved language and accurate flags:

```text
Video basename.eng.srt
Video basename.eng.forced.srt
Video basename.eng.sdh.srt
Video basename.fre.srt
```

For a version or part, use its full basename:

```text
Movie (2021) [tmdbid-12345] - Director's Cut.eng.srt
Movie (2021) [tmdbid-12345]-cd1.fre.srt
```

Do not add `.default` unless the user explicitly requests a default track. Do not label a standard subtitle as forced or SDH, or erase an existing accurate variant flag.

Check exact, case-folded, and Unicode-normalization-equivalent collisions. Never overwrite or silently replace an existing subtitle, even when the downloaded candidate appears better.

## Commit and report

After validation, move the staged payload to the final path with no-clobber semantics. For paired subtitles, ensure both final names are free before committing either; if a safe all-or-nothing commit is unavailable, keep both staged and report the blocker rather than leave a lone member.

Report per video and language:

- reused external path;
- complete embedded coverage;
- retrieved final path and provider/match basis;
- variant (`standard`, `forced`, `sdh`/`cc`);
- timing evidence classification;
- missing language and reason;
- unresolved language/identity, malformed payload, collision, quota, credential, or provider failure.

Do not expose credentials or temporary signed URLs. Do not claim a Jellyfin scan or playback result unless it actually occurred.
