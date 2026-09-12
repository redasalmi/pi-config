---
name: music-library-organizer
description: Audits or organizes local music folders, filenames, and embedded metadata while preserving audio and sidecars. Use for library previews, scoped organization/tag repair, or cleanup verification; not acquisition, transcoding, or general filesystem cleanup.
compatibility: Requires local filesystem access, Python 3 with Mutagen, and ffprobe. Catalog lookup is optional and needs network access. Do not install missing tools automatically. Verify atomic no-clobber publication support on the target filesystem.
metadata:
  author: local
  version: "3.0.0"
---

# Music Library Organizer

Make local music organization and metadata useful without changing encoded audio or unrelated metadata.

## Select mode and change set

- **Plan:** audit, preview, or dry run. Produce the complete proposed manifest without filesystem changes or downloads.
- **Apply:** organize, tidy, sort, move, rename, retag, or fix metadata. Complete the requested, confidently established changes and validate each publication unit.
- **Verify:** inspect the requested current layout, metadata, and integrity without mutation.

Resolve the change set independently: folder organization, metadata repair, filename cleanup, and tightly coupled sidecar-reference repair.

A broad organize/tidy/sort request authorizes folder organization plus filling missing high-confidence identity fields for conventional album tracks. It does not authorize correcting nonblank conflicting tags, renaming files, assigning genres/dates, fetching artwork/lyrics, or removing duplicates. Tag-only work does not move files; rename-only work does not rewrite tags unless the specific filename-derived correction was requested.

Follow explicit user identity/instructions, verified library conventions, trustworthy embedded IDs/tags/release context, verified exact-release sources, then portable defaults. Ask only about material ambiguity that evidence cannot resolve; continue safe independent units when another unit is blocked.

## Load the relevant procedure

- **Plan and Apply:** read [references/inventory-and-plan.md](references/inventory-and-plan.md) for canonical scope, stability gates, inventory, identity confidence, sidecar handling, and manifest invariants. For Verify, use the portions needed to establish the requested state.
- **Organization, filename cleanup, or tag editing:** read relevant sections of [references/metadata-and-layout.md](references/metadata-and-layout.md). It owns release-aware layout, native tag representations, format preservation, naming policy, and checksums.
- **Before any Apply mutation:** read and follow [references/transaction-and-validation.md](references/transaction-and-validation.md). It owns journals, preflight, staging, publication, tag/audio validation, source cleanup, and recovery.
- **An exact candidate from the previously researched collection:** consult [references/known-library-mappings.md](references/known-library-mappings.md) only for that candidate. Historical mappings are scoped evidence, not fuzzy defaults or permission to invent missing values.

Filename cleanup follows an established convention. If none exists and the user explicitly delegates naming, state a sensible template in the manifest and proceed when identity, ordering, sidecar references, and collision checks are sound. Otherwise propose the template and resolve that decision before renaming. A naming question must not stop independent authorized work.

## Non-negotiable Apply boundaries

- Work only within a canonical, deliberately selected music subtree or named files. Do not infer a broad mixed-purpose parent, follow links outside scope, or process active/unstable files.
- Apply authorizes only manifest-backed moves, requested renames/tags, and tightly coupled sidecar changes. Copy only when explicitly requested. Never delete duplicates, overwrite collisions, choose competing encodes, or merge different editions.
- Preserve encoded audio, codec/container, gapless information, streams, useful tags and native multiplicity, artwork, lyrics, chapters, cue sheets, playlists, checksums, and unknown sidecars. Do not transcode, remux, split images, normalize loudness, or acquire media.
- Correct nonblank identity fields, move between releases/artists, or add provider IDs only with confirmed evidence. Blank fields may use converging high-confidence derived evidence. Do not populate placeholder values merely to make tags nonblank.
- Stage tag edits on copies, verify exact changed and preserved metadata and encoded-audio identity, and keep a recoverable original until final validation. Move/copy-only operations must prove byte identity. A full-file hash is not expected to remain equal after retagging.
- Publish with the required no-clobber primitive (or the reference's explicit tag-only backup-and-replace protocol). Stop the affected unit if the primitive is unavailable. Per-file publication into an existing folder is recoverable, not group-atomic; never claim rollback without evidence.
- Never remove a source or backup before the whole unit passes final validation. Preserve the only good copy and report precise recovery paths after failure.

Do not install tools automatically, upload audio/fingerprints/hashes/private inventories without authorization, execute sidecars, or expose secrets. Mutagen and ffprobe are required for safe Apply; unavailable tools permit only clearly limited Plan/Verify evidence.

Use media checks rather than repository tests, linters, or builds. This boundary applies to media organization, not a separately requested coding task.

## Completion

Validate every changed audio file and coupled sidecar under the transaction reference, not a representative format sample. Reconcile inventory, manifest, published members, and unresolved originals. Report an audio-payload assurance gap when only technical properties could be compared; do not present it as full payload proof.

Use one status:

- **Planned:** complete proposed manifest, no changes.
- **Verified:** requested Verify scope inspected and stated checks complete, no changes.
- **Complete:** every requested Apply unit published and validated, with assurance level stated.
- **Partial:** any mode remains incomplete due to named ambiguity, blockers, unsupported files, instability, or failed checks.
- **No changes:** Apply found the scope compliant or no safe authorized mutation available; explain which.

Report root, mode/change set, inventory counts and unsupported items, applied/proposed moves and tag fields, sidecar/reference changes, verification and assurance level, and unresolved items. List exact paths for collisions, failed units, and recovery artifacts. Do not claim playback, indexing, artwork display, gapless playback, or a library rescan without direct checks.

Read [references/sources.md](references/sources.md) only for provenance or methodology revision.
