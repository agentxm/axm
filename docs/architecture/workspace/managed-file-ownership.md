---
type: Architecture
status: stable
description: The name-only region fences, planned-target authority, projection currency, and deletion guard for AXM-managed workspace output.
depends-on:
  - ./overview.md
  - ./execution.md
  - ./lockfile.md
---

# Managed-file ownership

AXM changes native MCP entries and Hook registrations under the declaration
contract below. Other derived workspace output is AXM's only where the desired
graph and the selected scope's settings plan it: a named region in the planned
instruction target, or a declared whole file at its planned native path. No
inline attribute, banner, or lockfile row establishes ownership. Content AXM
did not plan is user-owned even when it resembles AXM output or points into a
canonical extension root.

## Native declaration authority

A validated effective declaration authorizes creating or completely replacing
its exact named MCP entry in configured agents' selected-scope native files.
Equal decoded values are a no-op; omitted fields are removed on replacement.
Inline, authored, acquired and Pack-contributed connections use the same desired
graph. No native ownership property, fence, receipt or lockfile ownership row is
required or emitted. Reprojection removes unsupported fields from selected
entries; undeclared entries remain untouched.

A Hook declaration selects registrations whose parsed direct `bash`, `node`,
`bun` or `python3` invocation addresses a script strictly below its absolute
canonical package root in the selected scope. Environment assignments and quoted
arguments retain their meaning. Updating that package replaces its selected
registrations, including changed event, matcher, entrypoint or arguments, and
consolidates old duplicates. Other commands and matcher groups retain their
order. Overlapping declaration roots, duplicate desired registrations and
selected scripts in unsupported shell compositions block the write. An event,
array index or command substring never grants mutation authority. Machine
outcomes address these units by settings key and selected script roots.

Removing or renaming a declaration, losing a Pack route or removing an agent
stops management without pruning native registrations. Retention does not mean
execution stopped. Explicit `mcps uninstall` and `hooks uninstall` capture the
selected name/package before changing intent and withdraw its registrations
from configured agents in the selected scope. Explicit disable uses a supported
native enable flag or withdraws the selected registration while retaining the
package; it does not disable copies in other agents. Native files and their parent directories remain. After a declaration
has gone, inspect the exact native file and remove only the selected key or
registration manually; there is no automatic orphan sweep.

Acquired package deletion is refused while retained native values reference its
code, including registrations for departing agents or lost Pack routes. Sync
retains that canonical content and its accepted resolution so a later bounded
cleanup can retire it safely; these records establish source integrity, not
native ownership. Explicit uninstall refuses until those exact registrations
are withdrawn. This safety check is read-only and grants no authority over their
containing files.

Complete-file reader validation, physical containment, stale-candidate checks,
serialization, rollback and secret redaction still apply. A compatible native
reader proves neither declaration authority nor an actual connection or Hook
invocation.

## Encodings

AXM uses one ownership vocabulary through substrate-specific evidence:

- A pair of name-only fences delimits a region AXM writes inside a
  human-authored file planned by settings.
- A declared whole file is authorized by its declaration and planned native
  path; it carries no marker.
- A symlink proves ownership by addressing the exact accepted canonical source
  for its identity and scope. Merely pointing somewhere inside an AXM root is
  insufficient; an instruction alias addresses its selected canonical source.
- A copied directory requires a receipt tying its managed contents and native
  location to the accepted source. Foreign children remain outside that proof.

## Native locations and sharing

An entry address identifies the directory entry that can be replaced or
removed. A content address identifies the resolved file a writer would edit.
These differ for symbolic links. Authority checks use the address appropriate
to the mutation, within the selected native scope and workspace authority.
Escapes, source overlap, ambiguous workspace roots, and unexplained hard links
block mutation before publication.

Several agent aliases may address one physical file or directory. AXM groups
them by physical location and ownership unit, preserving the configured
consumers and potential readers as separate facts. A shared structured file
must satisfy every applicable reader's complete grammar and the affected
unit's semantics before and after a write. An incompatible reader blocks the
shared write. Reader recognition does not itself grant ownership or prove
runtime availability.

## Insertion receipts

For file artifacts other than native MCP and Hook configuration, a newly
reachable extension or native route can create a container that AXM
later needs to retire. A local receipt records that creation or a bounded
syntax inverse, tied to the workspace, root, parent, entry, alias identities,
and exact postimage. It carries no unrelated configuration values and grants
no desired membership or accepted source authority.

Withdrawing precisely that new intent without intervening changes restores
the original bytes and preexisting empty containers. Adoption, activation,
source replacement, reinstall, and repair of existing intent do not establish
new insertion authority. Missing or invalid evidence preserves containers;
entry recreation, moved or copied workspaces, replaced parents, and changed
aliases expire the evidence. A foreign child prevents removal of its containing
directory. The last retired receipt removes its local metadata file.

A Pack introduction can publish several lockfile entries in one closure. Its
receipt follows those publications under the same explicit graph identity,
then permits the corresponding complete withdrawal to recover the original
document. A later command changing the source or other document intent expires
that baseline; it cannot extend or recreate the introduction's proof.

## Region fences

AXM writes a marker only where it writes a region inside a human-authored file:
the Rules and Knowledge regions of the canonical instruction file, and the
instruction-alias region of `.gitignore`. A fence names its region and nothing
else, in the file's native comment syntax:

```text
<!-- axm:rules -->            # Markdown open
<!-- /axm:rules -->           # Markdown close
# axm:instruction-aliases     # .gitignore open
# /axm:instruction-aliases    # .gitignore close
```

The closed runtime vocabulary is `rules`, `knowledge`, and
`instruction-aliases`. Only `.md`, `.mdx`, and `.gitignore` targets carry
regions. A fence carries no version, owner, source, or generation, and the
region body is one opaque unit that AXM replaces whole; there are no
per-contribution anchors.

A Markdown fence is a whole line that, after a trailing `\r` is removed, is
exactly an HTML comment whose trimmed text is `axm:<name>` or `/axm:<name>`. It
starts at column 0, so indented code, list continuations, and blockquote
content never hold a fence. A line inside a fenced code block is not a fence.
Code blocks follow CommonMark: one opens on a line indented 0-3 spaces with at
least three backticks or tildes, where a backtick info string contains no
backtick; it closes on a line indented 0-3 spaces holding only a run of the same
character at least as long as the opener, followed by whitespace; an unclosed
block runs to the end of the file. A code block opened inside a list item is
treated as top level. That can hide a fence but never invent one: a hidden fence
makes its region read as absent, so AXM appends a new region, and the post-write
check refuses the write unless exactly that region is then found intact. A hash
fence is a whole line
starting with `#` whose remaining text, trimmed, is `axm:<name>` or
`/axm:<name>`.

AXM creates or replaces a region only in the instruction target the selected
scope's settings plan (`instructionFiles.fileName` at that workspace root).
Planning and physical containment establish that authority; escapes,
overlapping or ambiguous roots, and alias retargeting still block the write. A
same-named fence in any other file is not AXM's. Duplicate, nested,
interleaved, or unpaired vocabulary fences in the planned target block the write
and name the path and region. An `axm:` fence with another name is left
untouched and reported by lint as information.

A new region is appended at the end of the file. After rendering, AXM re-reads
the result and refuses the write unless it finds exactly the intended region
with the intended body, so a body that would break the fences is never written.
Old inline-attribute markers from earlier releases match no fence and are plain
text.

Build-time documentation generators use the same grammar with their own names,
which a test keeps disjoint from the runtime vocabulary, and strip those fences
before publishing help or bundled content.

## Projection currency

The lockfile's `projections` section records one row per projected unit, keyed
by its scope-relative path under the kinds `rules`, `knowledge`,
`instructions` (the alias region and instruction copies), and `subagents`. A row
holds `gen`, a digest of the unit's canonical structured inputs, and `output`, a
digest of the bytes AXM last wrote. Each kind also records a projection
`contract` version. Rendered bytes are never an input to `gen`.

A unit is current when its row's `gen` and its kind's `contract` match the
expected values; AXM then does not inspect, normalize, or rewrite the body. This
covers formatter output and any other rewrite without requiring AXM to define
Markdown equivalence, and AXM emits no formatter directives. A changed source,
configuration, contributor set, target capability, or contract makes the unit
stale, and sync replaces it. A missing or unreadable row means unknown
currency: sync rewrites the unit once and records it. A changed `contract` strips
`gen` from that kind's rows but keeps `output`.

`output` is consulted only by the deletion guard, the preview's
`lastWrite` comparison, and the lint advisory for edited projections. It never
decides currency, and rows never establish ownership.

## Whole files and deletion

An existing file at a declared whole-file path with no row is recorded without
a write when its bytes equal the render. When they differ, the write is refused
unless the command was given `--replace-unrecorded`. AXM writes no backup files.

AXM deletes a whole-file output it no longer plans, on uninstall, agent removal,
deactivation, or rename, only while its bytes equal the recorded `output` or the
current render. A modified file is retained and reported, and
`--discard-modified` deletes it. A file with no row is never deleted. The row is
withdrawn in every case.

A hand edit of a region is overwritten when its inputs change. The preview marks
that replacement "modified since last write" when the body differs from
`output`; this is informational.

## Reconciliation

Rules and Knowledge discovery use generated whole-body regions. Managed Subagent
Markdown and TOML and instruction copies are unmarked whole files. Instruction
alias ignores use a pattern-list region in `.gitignore`. Native MCP and Hook
settings follow [declaration authority](#native-declaration-authority) and
compare decoded values, independently of formatting or comments.

Customization guidance lives in help topics rather than in projected files.
Workspace-authored packages name the source to change before sync, acquired
packages direct customization through `axm fork`, and bundled sources offer no
edit path.

`axm sync --preview --json` owns convergence: it identifies each managed unit
and exposes its `owner` provenance from the desired graph. `axm lint` reports
unowned agent-directory artifacts, unowned files at planned instruction targets,
stale AXM-owned instruction aliases, tracked instruction aliases covered by a
managed ignore pattern, and malformed region fences. As information, it reports
projected units whose bytes differ from `output` and `axm:` fences with unknown
names. It does not report generated-body currency.

When the lockfile or a projected file has a merge conflict, take either side and
run `axm sync`. A conflicted `output` can only narrow deletion or raise an
informational advisory. The
[name-only fences decision](../decisions/name-only-region-fences-and-lockfile-projection-currency.md)
records why this design replaced inline provenance.
