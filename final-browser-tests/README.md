# Final browser validation: cross-speaker condition resolution

Run these as two separate conversations in Unread Radar AI. Clear the previous chat between tests and select **Run fresh analysis (skip cache)**.

## Test 1 — Approval revoked

File: `01-approval-revoked.txt`

Expected:
- Chris's supplier-contact task is extracted with Chris as the owner.
- The condition state is **Reported rejected**.
- The 09:20 Legal correction is the current resolution evidence.
- The 09:05 approval remains visible as superseded evidence.
- The task itself remains for human review; a rejected prerequisite does not automatically mean the task is completed or rejected.

## Test 2 — Conflicting approval

File: `02-conflicting-approval.txt`

Expected:
- Chris's supplier-contact task is extracted with Chris as the owner.
- The condition state is **Ambiguous**.
- Both Legal's 09:05 approval and Compliance's 09:12 not-approved statement are retained as evidence.
- The app must not choose one reviewer over the other without an explicit correction or resolution.

## What to capture

For each test, capture the Action Items card showing the task owner, condition status, and related conversation context. Also capture the condition entries in the Catch-up Summary if present.

A successful Qwen response is not itself proof that the condition interpretation is correct. Compare the displayed state and evidence against the expected results above.
