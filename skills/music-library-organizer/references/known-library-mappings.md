# Previously Verified Library Mappings

These mappings preserve user-provided research for this specific library. Apply one only when the inventory contains the exact named candidate and current file evidence is compatible. Never use fuzzy artist/title similarity, transfer a value to another edition, or rely on model memory for details absent below.

## Application statuses

- **Actionable** — the mapping contains enough explicit values to apply after identity and collision checks.
- **Partial** — some routing or tags are known, but missing values must be re-established before writing them.
- **Routing only** — use it to narrow investigation, not to write metadata directly.

## Mappings

### Spock's Beard discography — Partial

- Candidate: `Spock's Beard - Discography/`
- Destination artist folder: `Spock's Beard/`
- Preserve the four existing category folders: `Studio Albums`, `Live`, `Compilations`, and `Singles, EPs, Fan Club & Promo`.
- Add `albumartist=Spock's Beard` where the represented release credit supports it.
- Correct disc numbers from the actual release/disc structure. Exact values are not encoded in this mapping and must not be invented.

### Shadrane — Temporal — Actionable

- Candidate: `Shadrane - 2008 - Temporal/`
- Destination: `Shadrane/2008 - Temporal/`
- Set `albumartist=Shadrane`.
- Set `discnumber=1/1` only after confirming the folder is the one-disc release represented by this mapping.

### D'ZAIR — Hizia — Actionable

- Candidate: `dzair/hizia/`
- Destination: `D'ZAIR/hizia/`
- Album: `Hizia`
- Genre: `Alternative`
- Do not guess a release year.

### Sun City — Forever — Partial

- Candidate: the previously researched Sun City loose tracks.
- Destination: `Sun City/Forever/`
- Album: `Forever`
- Album year: `2025`
- Genre: `Synthwave`
- The prior mapping references a verified 10-track order and feature credits, but those exact values are not present in this file. Re-open the authoritative source or obtain the detailed mapping before writing track numbers or credits.

### Garmarna — Herr Mannelig compilation track — Actionable

- Candidate: `garmarna-herr-mannelig.mp3`
- Destination: `Garmarna/Miroque - Romantisches Mittelalter (2006)/`
- Track: `14/15`
- Year: `2006`
- Genre: `Folk`
- Album artist: `Various Artists`
- Retain the actual track artist credit from the file or verified release evidence.

### Ihan X Twelve remixes — Partial

- Candidate: the previously researched Ihan X Twelve remix files.
- Destination: `Ihan X Twelve/Singles/`
- Genre: `Dance`
- Remove verified YouTube/source suffix clutter from titles while retaining remix/version distinctions.
- Use only separately verified years; this mapping does not enumerate them.

### Randall — Wahran — Actionable

- Candidate: Randall's `Wahran` files.
- Destination: `Randall/Wahran/`
- Year: `2019`
- Genre: `House`
- Preserve the `Extended Mix` distinction.

### Said Lagam, Chikh Marmri, and No Disc x Cheb Lotfi — Routing only

These one-offs belong in verified artist/release folders when identity can be established from reliable filenames or sources. This mapping contains no exact release, year, genre, track order, or credit values; do not invent them.

### Memes and gaming sound effects — Library-specific convention

- Destination: `Miscellaneous/Memes & Audio Clips/`
- Album: `Memes & Audio Clips`
- Album artist: `Various Artists`
- Use `Unknown` artist only for genuinely anonymous items under this explicit user-created compilation convention.
- Use a numbered compilation order only when a stable order is defined in the current inventory or by the user; do not assign arbitrary numbers merely to fill tags.

## Final guard

These are identity-specific decisions, not defaults for unrelated music. If current embedded IDs, duration, track count, edition, or source naming contradict a mapping, stop that item and report the conflict rather than forcing the historical value.
