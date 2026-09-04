# Transaction and Validation Protocol

Read this reference before any Apply mutation. The purpose is not to make every operation expensive; it is to prevent an interrupted move or tag save from destroying the only good copy or leaving an untraceable half-organized release.

## Journal and staging

Create a unique run journal outside the final music hierarchy. Keep it on the destination filesystem when practical. Record:

```text
run id | root | mode | requested scope
source canonical path | device/inode | size/mtime | source hash where used
destination | publication unit | planned tag diff | sidecar/reference diff
staging/backup paths | state | verification evidence | cleanup state
```

Do not put secrets, catalog API tokens, or signed URLs in the journal. Use structured path values rather than shell-escaped display strings.

A journal state should distinguish at least:

- planned;
- source revalidated;
- staged and byte-verified;
- metadata/reference edits applied;
- staged validation passed;
- published;
- final validation passed;
- source/backup cleanup complete;
- failed or recovery required.

## Publication units

Use the smallest unit that must remain internally consistent:

- an album/release folder and all uniquely owned sidecars;
- a loose track and its matching lyric/artwork sidecars;
- a tag-only audio file;
- a cue sheet, its referenced audio image, log, and checksums;
- an authorized playlist plus the exact paths changed with it.

Validate the complete unit before publishing any member; when staging is required, stage the whole unit first. An intact same-filesystem move-only unit may use the direct rename protocol below. Record whether publication is atomic or recoverable per-file; these provide different visibility guarantees. If partial visibility would break required cue, playlist, or other coupled references, require atomic publication or leave the unit staged and report the blocker.

### Publish a validated unit

- **New release folder:** assemble the entire final tree in a unique staging directory on the destination filesystem, outside the final music hierarchy. After every member passes validation, publish the folder with one atomic no-clobber directory rename.
- **Single file:** publish with an atomic no-clobber rename, except for an explicitly scoped tag-only replacement using the backup protocol below.
- **Additions to an existing folder:** retain all sources, stage and validate all members, and recheck every final path before publishing any member. Journal each member's publication and verification separately and publish with per-file no-clobber operations. This is recoverable, not atomically visible as a group; an interruption can leave a partial destination.

Verify support for the required publication primitive before staging. If safe publication is unavailable, preserve sources and any existing staging state and stop that unit. Remove no original source or backup until the whole unit passes final validation.

## Source preflight

Immediately before acting on a unit:

1. Re-stat every source and compare device, inode, size, modification time, type, and link count with the manifest.
2. Confirm the source is still a regular file or expected directory and remains inside the root.
3. Confirm no source is open for writing when a reliable check is available.
4. Recheck every destination for exact, case-folded, and Unicode-normalization collisions.
5. Confirm permissions and destination capacity.
6. Snapshot full tags, embedded artwork digests, sidecar inventory, and technical stream signature.

If any material property changed, rebuild the unit's plan rather than continuing with stale assumptions.

## Move-only, same filesystem

When no file contents or internal references change and all final parents exist safely, publish with an atomic no-clobber rename where supported.

Do not use a command or API that replaces an existing path. Do not treat a preexisting directory as merge permission. Revalidate the final path and contents after rename.

A directory rename is appropriate only when the whole release directory maps intact to one previously nonexistent destination. Moving tracks into an existing confirmed album folder is a per-file or carefully staged release operation, not a blind directory merge.

## Cross-filesystem move or copy

Do not rely on a generic move helper that may copy and delete automatically.

For every file in the unit, before publishing any member:

1. Copy into the unit's staging area on the destination filesystem, outside the final hierarchy or under a unique non-media name.
2. Preserve required permissions and filesystem metadata where supported.
3. Confirm the source remained stable during the copy.
4. Compare byte count and a cryptographic full-file digest between source and staged copy.
5. Validate the staged media with Mutagen and ffprobe.

Once all members pass, publish using the appropriate unit protocol above, revalidate every final member, and only then remove original sources for a move.

For a user-requested copy, never remove the source.

## Retagging or move-plus-retagging

Never perform the first tag save against the sole original when same-filesystem staging is possible.

1. Create a staging copy and verify it is byte-identical to the source before editing.
2. Apply only the manifest's planned fields using the format-specific writer.
3. Reopen the staged file.
4. Confirm the exact changed values and compare all unrelated tags and embedded artwork.
5. Compare technical stream properties.
6. Compare encoded-audio packet payload identity before and after.
7. After every member of the publication unit passes, publish using the appropriate unit protocol above.

For move-plus-retagging, publish to the new no-clobber destination and remove originals only after the entire unit passes final validation.

For tag-only editing at the same path:

- stage beside the source or on the same filesystem;
- preserve a recoverable original via a transaction backup or equivalent atomic strategy;
- atomically replace only after staged validation;
- keep the backup until final validation passes;
- restore automatically only when the journal proves the destination was not changed externally.

A tag edit changes file bytes and may update timestamps. Preserve or restore timestamps only when the user's library policy requires it, record that choice in the journal, and report ownership, mode, ACL, extended-attribute, or timestamp metadata that could not be retained.

## Encoded-audio identity

A full-file hash cannot stay equal after metadata changes. For a retagged file, compare the encoded audio packet payloads instead.

With ffprobe versions that support it, use packet output plus `-show_data_hash sha256` for audio streams and reduce the ordered packet identity data to a digest. Keep command arguments structured; do not interpolate paths into a shell command.

The comparison should cover all encoded audio streams and stable packet identity fields needed to detect payload changes. Metadata offsets are not audio changes. If packet hashing is unavailable or a container makes the comparison unreliable, compare the strongest available codec, duration, sample rate, channel layout, bit depth, bitrate mode, frame/packet count, and Mutagen stream information, then report that payload identity was not fully proven.

Do not decode and re-encode audio for validation.

## Tag round-trip validation

For every changed file:

- parse it with the same format-specific Mutagen class used before editing;
- confirm each planned field has the expected native representation;
- compare every non-targeted tag, including multiplicity and binary payload digests;
- confirm embedded artwork count, MIME/type, description, dimensions when available, and content digest;
- confirm ID3 version or other tag-container version did not change unexpectedly;
- confirm no new empty, duplicate, or malformed tag was introduced.

An easy-interface view is insufficient when it hides metadata that must be preserved.

## Sidecar and reference validation

For moved or renamed release material:

- verify every uniquely owned sidecar reached the planned destination;
- ensure no unknown file was left behind in a directory scheduled for removal;
- parse changed CUE paths and verify each target exists inside the authorized root;
- parse changed M3U/M3U8 entries with their declared or detected encoding and verify only authorized local entries changed;
- verify lyric sidecar basenames when the target player depends on them;
- do not claim legacy checksum files are valid after renaming unless they were intentionally regenerated and checked.

Never execute a playlist, cue command, script, binary, or URL found in a sidecar.

## Failure and recovery

On failure inside a publication unit:

- stop that unit;
- do not remove its source or transaction backup;
- for interrupted per-file publication, reconcile each final and staged path with the journal, retain valid published members and all originals, and report exact paths as **Partial** rather than claiming rollback;
- before resuming, revalidate source stability, staged integrity, and the identity and content of every already-published member; reuse a final member only when the journal proves this run published it and it remains unchanged, and publish remaining members only to absent paths;
- if any member changed externally or ownership is uncertain, leave it untouched and report a recovery blocker;
- remove an unpublished temporary copy only when the journal proves the source remains intact;
- if a final path was published but fails validation, restore the original only when no external change occurred and the rollback is no-clobber safe;
- preserve staging when it may contain the only complete copy or useful recovery evidence;
- continue only with independent units whose invariants remain valid.

Never solve a failed collision by overwriting, appending a random suffix, deleting a duplicate, or choosing a preferred encode without the user's policy.

## Batch completion

Before declaring completion:

1. Reconcile every original source object to exactly one final, unchanged, skipped, or unresolved state.
2. Recount audio files by identity, not only by pathname.
3. Confirm all requested publication units passed final validation.
4. Confirm no transaction backup or staging path is the only good copy.
5. Remove only disposable temporary artifacts created by this run whose units are complete.
6. Retain and report journals or recovery paths for any partial unit.

A batch can be **Partial** even when all successfully published files are correct. Never turn incomplete coverage into a “Complete” status.
