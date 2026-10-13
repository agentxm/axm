---
type: Decision
status: stable
description: AXM marks only the regions it writes inside human-authored files, with name-only fences, and records projection currency and last-written digests in the lockfile instead of in the projected files.
depends-on:
  - ../workspace/managed-file-ownership.md
  - ../workspace/lockfile.md
  - ../workspace/instruction-files.md
  - ./executable-specifications-authority.md
---

# Name-only region fences and lockfile projection currency

## Decision

AXM writes a marker only where it writes a region inside a human-authored file:
the Rules and Knowledge regions of the canonical instruction file and the
instruction-alias region of `.gitignore`. A region is delimited by a pair of
fences that carry its name and nothing else, in the file's native comment
syntax: `<!-- axm:rules -->` … `<!-- /axm:rules -->` in Markdown and
`# axm:instruction-aliases` … `# /axm:instruction-aliases` in `.gitignore`. The
runtime vocabulary is closed: `rules`, `knowledge`, and `instruction-aliases`.
The region body is one opaque unit that AXM replaces whole. Subagent files and
instruction copies carry no marker or banner.

Authority comes from planning, not from the file. AXM may create or replace a
region only in the instruction target the selected scope's settings plan, and a
whole file only at the planned native path of a declaration. A same-named fence
elsewhere is not AXM's.

The lockfile records currency. Its `projections` section holds, per kind
(`rules`, `knowledge`, `instructions`, `subagents`), a projection `contract`
version and one row per unit keyed by scope-relative path:

- `gen`, a `sha256:` digest of the unit's canonical structured inputs, never of
  rendered bytes. Matching `gen` and `contract` mean the unit is current, and AXM
  does not inspect its body.
- `output`, a `sha256:` digest of the bytes AXM last wrote. It is required on
  every row.

The lockfile version moves from 11 to 12.

### Fence recognition

A Markdown fence is a whole line that, after a trailing carriage return is
removed, is exactly an HTML comment whose trimmed text is `axm:<name>` or
`/axm:<name>`. It starts at column 0, so indented code, list continuations,
and blockquote content never hold a fence. A line inside a fenced code block is
ignored. Fenced code blocks follow CommonMark: one opens on a line indented 0-3
spaces with three or more backticks or tildes, where a backtick info string
holds no backtick. It closes on a line indented 0-3 spaces holding only a run
of the same character at least as long as the opener, then whitespace. An
unclosed block runs to the end of the file. A hash fence is a whole line that
starts with `#` and whose remaining text, trimmed, is a fence.

The scanner is a bounded line scanner rather than a Markdown parser
dependency. It treats a code block opened inside a list item as top level.
That can hide a fence but never invent one: a hidden fence makes its region
read as absent, so AXM appends a new region, and the post-write check that
re-reads every rendered region refuses the write unless exactly that region is
found intact.

Duplicate, nested, interleaved, or unpaired vocabulary fences in the planned
target block the write and name the path and region. An `axm:` fence with any
other name is left untouched, and lint reports it as information.

### Supporting choices

| Choice                                                                                                                                    | Reason                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| A contract bump strips `gen` and keeps `output`                                                                                           | Units become stale without losing the evidence the deletion guard needs    |
| Instruction symlinks get no row                                                                                                           | Link proof already covers them                                             |
| Rows are ordinary lockfile state for exact restoration                                                                                    | A failed or reverted closure must not leave rows that widen later deletion |
| Writers return row changes; one accepted-resolution batch stages them                                                                     | One lockfile writer, one commit, and pure previews                         |
| `--replace-unrecorded` on every command that can write a whole-file projection, `--discard-modified` on every command that can delete one | A refusal names a recovery on the same command                             |
| `output` is read only by the deletion guard, preview `lastWrite`, and lint                                                                | Currency stays formatter-agnostic, and sync never repairs `output`         |
| Rows are never ownership proof                                                                                                            | The lockfile charter still never establishes ownership                     |

An existing whole file at a planned path with no row is recorded without a
write when its bytes equal the render. When they differ, the write is blocked
unless `--replace-unrecorded` is given. A whole file AXM no longer plans is
deleted only while its bytes equal `output` or the current render. A modified
one is kept and reported unless `--discard-modified` is given, and an
unrecorded one is never deleted.

Build-time documentation generators use the same fence grammar with their own
names. A test keeps those names disjoint from the runtime vocabulary, and the
generators strip their fences from published help and the bundled skill.

## Context

The previous grammar wrote `axm:start`, `axm:end`, `axm:point`, and `axm:file`
markers with inline `v`, `ext`, `src`, and `gen` attributes into every
comment-bearing projection, including whole-file banners in Subagent files and
instruction copies. The attributes carried provenance and currency inside
files that people and formatters edit. They added noise to agent-visible
content, needed a version and an unsupported-version state, and made ownership
depend on text a person could copy or damage. Planning already knows which file
and region each unit belongs to, so inline provenance duplicated planned
authority.

## Consequences

- Projected files carry the least possible AXM text: two fence lines per region
  and nothing in whole files.
- Sync converges on formatter-rewritten units without defining Markdown
  equivalence.
- A hand edit to a current unit stays until an input changes. The preview then
  marks the replacement "modified since last write", and lint reports the edit
  with the source or `axm fork` route to keep it.
- Every v11 workspace must resync under v12, and the next sync rewrites each
  region once. Old-grammar blocks in user workspaces are plain text that AXM
  neither reads nor removes. AXM appends a new fenced region beside them, and
  the release note asks users to delete the old blocks.
- First use in a repository whose canonical file and a differing alias copy
  both exist now blocks until the alias is moved or `--replace-unrecorded` is
  given.
- `axm instructions adopt` records the current region instead of rewriting
  inline proof and no longer takes `--file`.
- Merge conflicts resolve by taking either side and running `axm sync`. A wrong
  `output` can only narrow deletion or raise an informational advisory.

The accepted behaviors live as executable specifications in the
[specification catalog](../../../specifications/catalog.md), including
`workspace/projections/fences-are-name-only-and-top-level`,
`workspace/projections/native-regions-follow-planned-target`,
`workspace/lockfile/records-projection-currency`, and
`cli/lint/reports-modified-projections-and-unknown-fences`. This record
explains the choice.

## Alternatives

- **Inline provenance with a new grammar version.** Rejected. It keeps
  provenance in editable text and duplicates the planned authority.
- **One aggregate digest per kind or workspace.** Rejected. It cannot tell
  which unit changed, so it cannot guard deletion per file.
- **Keeping whole-file banners for guidance.** Rejected. Guidance belongs in
  help topics, and banners added text to agent-visible files.
- **Backup files before replacing or deleting.** Rejected. They leave unowned
  residue, and the explicit flags already make destructive intent visible.
- **An adopt path for whole files.** Rejected in favor of one override per
  policy (`--replace-unrecorded`).
- **Repairing `output` during sync.** Rejected. It would make sync read every
  current unit and lose formatter agnosticism.
- **A Markdown parser dependency for fence detection.** Rejected for a bounded
  line scanner with the post-write check.

## Reconsideration

Reconsider if AXM must write regions into a file type without a line comment
syntax, if a projection kind needs per-contribution identity inside a region,
or if public launch requires reading older lockfile versions.
