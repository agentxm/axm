# Reviewing the decisions in a skill and a hook

The candidate exposed a boundary question the prior review missed on one skill.
Both versions found the skill's output friction and wasted work, and both
identified the hook's keying error. The candidate remains provisional.

## Comparison

Fresh read-only Codex CLI 0.170.0 sessions received the same prompt, “$axe
review ./sample. Use the project axe skill and its workspace knowledge. This
is a text-only review.” Each Git workspace contained its own target, projected
skill, and authored engineering knowledge retrievable through AXM. The CLI used
its default model with low reasoning effort. The baseline used `ff0f7380d`.
Candidate source SHA-256 values were:

| Source            | SHA-256                                                            |
| ----------------- | ------------------------------------------------------------------ |
| AXE SKILL.md      | `158bb3d72a3d1853eef936df1a759f2685174cff415ea404fc10f4b4e8c53d14` |
| Review guide      | `11feb0cc538c29a15733b3c4526b9eaf342f7fe271f801e0674ea7f4e927934f` |
| Candidate pattern | `971e5c837ee0ec7a798c90760e80c814762c17ece482fa4e65da039fe9111093` |

| Target                                | Baseline                                                                                                                              | Candidate                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File-size reporting skill             | Found that readers had to match paths to results across two numbered lists. Found a second metadata pass whose values were discarded. | Labeled those findings Improvement and Pruning. Also identified an Issue: the skill promised one result per input and sizes for regular files, yet gave no disposition for a readable directory. Suggested checking a directory alongside a regular file and a missing path. |
| Document-save hook                    | Found that keying revisions by display name loses the association with the numeric document ID.                                       | Identified the same Issue and traced two same-name documents to one entry. Recognized that repeated assignment for a duplicate delivery already preserves the value.                                                                                                         |
| Corrected hook                        | Outside the paired comparison.                                                                                                        | Clean. Two documents with the same name retain distinct entries by ID. Replaying a save sets the same revision.                                                                                                                                                              |
| Size report, focused on missing files | Outside the paired comparison.                                                                                                        | Clean within focus. A missing path gets the documented `unavailable` value in its input position. The broad findings stayed out of this report.                                                                                                                              |

The size-report skill explicitly defined its reader's job as looking up a
particular path. It specified paired list positions, ordered inputs, one result
per path, and `unavailable` for missing or unreadable files. For the hook,
the fixture guaranteed ordered revisions per document, allowed duplicate
deliveries and shared display names, and specified that readers used numeric IDs.
The corrected callback changed only the mapping key.

On the broad skill and hook, the candidate consulted both indexes and reached
skill-authoring and display guidance or hook guidance respectively. Recorded
shell commands went from six to seven for the skill and eight to nine for the
hook. One command can retrieve several concepts. The focused missing-file
review took three commands.

## Focused lookup recheck

Given just an excerpt linking a migration guide, the candidate correctly left
archive availability open but also retrieved the progressive-disclosure pattern.
The final router tells the reviewer to open another concept only when the
review guide and the target leave a decision open. On the identical prompt, a
fresh review named the published archive listing as the missing evidence and
retrieved only the review guide. Fresh broad reviews still found all three
categories in the size report and returned a clean result for the corrected
hook. The final router SHA-256 was
`e886360a377ca9d4e93bd7042406ac2e495970b827b864c659a84570204de2a0`.

## Apply selected

Two fresh, writable Codex app-server sessions reviewed copies of the same
size-report skill. Each reported the paired-list improvement as finding 1 and
the discarded lookup as finding 2. In one, the client submitted the native
**Apply selected** choice and chose finding 2 in the next control. In the other,
the client replied `apply 2` after the text report. Git diffs showed only the
selected change in each workspace. The picker run replaced the reread with
“Return the rendered report.” The text run deleted the reread instruction.
Both preserved the original two lists and the missing-file behavior.

The comparison covers these synthetic artifacts on one host. The extra
directory finding identifies an unspecified input case. Runtime handling of
directories was outside the trial. A single paired observation per artifact
cannot establish typical effectiveness, cost, or causation. The native trial
exercised the selection protocol with scripted answers.
