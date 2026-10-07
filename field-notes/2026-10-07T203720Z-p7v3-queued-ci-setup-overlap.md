---
observed_at: "2026-10-07T20:37:20.849854+00:00"
session: "publication-file-selection-p7v3"
area: "GitHub native merge queue"
---

# Independent CI repairs conflicted in the merge queue

## Context

The publication file-selection pull request passed Required CI and entered the queue behind another publication change.

## Friction

GitHub marked the second entry unmergeable despite its being clean against current main. A read-only merge-tree check found exactly one conflicted path: the shared setup action. Both changes independently removed the same failing Azure mirror, but used different APT retry and timeout settings.

## Outcome

Only the file-selection pull request was dequeued. Its action was aligned byte-for-byte with the preceding entry's supported native APT settings and HTTPS mirror selection, preserving both product changes. Local and hosted verification will run on the aligned revision.

## Evidence

Public PRs #535 and #537; accepted file-selection source 43c226507607331bb7a54db5ee501bd052d9b9b3; preceding source 46310b0456dc6c1b7d35d2312b2f61d509f7cfa4. Main remained 6ec49a8177076210b63ea4ebd2f3591190431ed6 during the conflict check.
