# Apply a PR or MR Description

Use only when the user explicitly authorizes creating or updating a specific PR/MR. Drafting text alone never authorizes a provider write.

## Apply an external update safely

Only when explicitly requested:

1. resolve the exact provider, repository, base, head, and destination;
2. for an update, read the current PR/MR title, body, head OID, selected/default template information when available, and relevant checks; for a creation, verify the intended base/head and whether a conflicting open request already exists;
3. draft against that exact head, preserving valid existing content for an update;
4. immediately before writing, re-read the existing target or revalidate the create inputs, and stop if the base, head, title, body, or destination changed materially during drafting;
5. create or update only the explicitly requested fields;
6. do not introduce side-effecting keywords, mentions, labels, assignees, milestones, or reviewer requests without explicit intent;
7. re-read the created or updated PR/MR and report the exact target and fields changed.

Do not create a replacement PR, push commits, change branches, or modify repository files as part of applying a description.
