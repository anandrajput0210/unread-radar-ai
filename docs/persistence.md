# Optional local persistence

Unread Radar AI keeps chat input and analysis in memory by default. The **Save this analysis on this device** toggle is off by default. Nothing is written by this feature until saving is enabled.

## What is saved

When enabled, each saved record contains:

- The analysis result, including extracted task text and exact quoted evidence.
- Human review decisions and task statuses.
- The selected identity, if one was chosen.
- A normalized chat fingerprint, an exact source-snapshot identifier, per-message fingerprints and source ranges, the save time, and the schema version.

Records are held in this browser's `localStorage`, with a maximum of five sessions and a 512 KiB limit per record. The raw chat text and full source snapshot are not stored. Message fingerprints use a deterministic non-cryptographic hash; they are comparison keys, not a security or identity mechanism. The app does not sync saved data to other devices.

Browser `localStorage` is not encrypted. Data can be read by scripts running for this site and by anyone or software with access to the browser profile or its site-storage tools. Do not enable saving on a shared or unmanaged device for sensitive conversations.

Storage access can be blocked or run out of space. In that case the app reports that data was not saved and continues with the in-memory analysis.

## Restore and chat identity

An analysis and its review decisions are restored only for an exact matching normalized chat fingerprint and source-snapshot identifier. The selected identity is restored only if that speaker is present in the loaded chat. Editing or appending messages does not carry over identity or review decisions.

For an appended export, the app may compare it with a saved shorter export when the saved message fingerprints are an exact prefix. Tasks are matched conservatively by exact evidence quote and source-message index. Ambiguous matches are labelled “possibly the same”; the app does not silently merge tasks. This comparison does not carry over the previous review state.

## Turn off or delete saved data

Turning the toggle off stops new saves but does not delete records already saved. Select **Clear saved data** to remove all keys written by this feature from this browser's localStorage; unrelated site-storage entries are left untouched. Clearing also turns saving off. This removes the feature's keys but cannot guarantee forensic erasure from browser-managed storage, backups, or device media. Browser-managed model assets and explicit user downloads are separate from this feature's saved records.
