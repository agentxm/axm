---
type: Architecture
status: stable
description: The versioned ownership grammar and reconciliation rules for AXM-managed workspace output.
depends-on:
  - ./overview.md
  - ./execution.md
---

# Managed-file ownership

AXM changes native MCP entries and Hook registrations under the declaration
contract below. Other derived workspace output requires ownership proof for the
exact unit being changed. Ownership is explicit, versioned, native to the
target substrate, and independent of human-facing guidance. For those other
artifact types, unmarked content is user-owned even when it resembles AXM output or points into a canonical
extension root.

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

- A fence owns a byte range in comment-bearing text.
- A banner owns a whole comment-bearing file.
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

## Marker grammar

The canonical comment-bearing grammar is:

```text
axm:start v=1 region=<id> [ext=<fqn>] [gen=<digest>]
axm:end v=1 region=<id>
axm:file v=1 ext=<fqn> src=<path> [gen=<digest>]
axm:point v=1 kind=<kind> ext=<fqn>
```

The target file supplies the native comment delimiters: Markdown and HTML use
`<!-- -->`, CSS uses `/* */`, supported programming languages use `//`, and
shell-like formats and explicitly allowed basenames use `#`. AXM refuses
unknown extensions and JSON-like dotfiles because guessing a comment syntax
could corrupt user data.

The closed region vocabulary is `rules`, `knowledge`,
and `instruction-aliases`. Region identity is the
`region` value alone. That address does not establish the owner: source,
reference, and scope evidence must match the accepted authority for the unit.
`gen` and unknown version-1 attributes do not change its address. For a generated document, `gen` is
a digest of canonical structured inputs: the ownership unit and projection
contract, contributor and source identities, authoritative source content,
target agent and capabilities, and applicable configuration. Rendered output
bytes are never an input to this digest.

Serialization orders attributes as `v`, `region`, `ext`, `src`, `gen`, then any
remaining keys lexicographically. Values containing whitespace, `%`, `=`, or
`~` are encoded as `~` followed by the URI-encoded JSON string. Readers accept
attributes in any order and ignore unknown attributes at version 1.

## Reconciliation

A reader classifies a managed region as `absent`, `complete`, `malformed`, or
`unsupported-version`, with a distinct reason code. Absent units may be
created. Complete units may be replaced in place. Duplicate, nested, or
unpaired markers are malformed and block the affected write. A version newer
than the running CLI blocks the write and instructs the operator to upgrade
AXM; AXM never guesses how to mutate an unknown grammar.

Generated document bodies are opaque projections, not authority or integrity
boundaries. When ownership is valid and `gen` matches the generation expected
from current authoritative inputs, AXM does not inspect, normalize, classify,
or rewrite the body. This covers formatter output and any other body rewrite
without requiring AXM to define Markdown equivalence. AXM emits no formatter
directives. User-authored bytes outside an owned unit remain unchanged, and
ambiguous ownership causes no write.

When authoritative source, configuration, contributor membership, target
agent capabilities, or the projection contract changes, expected generation
changes and sync replaces the generated body. A version-1 generated document
without `gen` has ownership evidence but no currency evidence; sync reconciles
it once. It does not fall back to body normalization.

Rules and Knowledge discovery use generated whole-body
regions. Managed Subagent Markdown and TOML, and instruction copies use generated whole-file banners.
Instruction alias ignores use a pattern-list region in `.gitignore`.
Native MCP and Hook settings follow [declaration authority](#native-declaration-authority)
and compare decoded values, independently of formatting or comments.

Whole-file banners lead with `axm:file`; the human-facing
guidance that follows reflects source authority. Workspace-authored packages
name the source to change before sync, workspace configuration names its
configuration source, acquired packages retain immutable provenance and direct
customization through `axm fork`, and bundled sources offer no edit path. The
guidance may change without affecting ownership or requiring a new marker
grammar version.

`axm sync --preview --json` owns convergence: it identifies each managed unit
and exposes its `owner` provenance. `axm lint` reports unowned agent-directory
artifacts, unowned files at planned
instruction targets, stale AXM-owned instruction aliases, tracked instruction
aliases covered by a managed ignore pattern, invalid ownership structures, and
unsupported marker versions. It does not report generated-body currency.

The version-1 ownership grammar remains a clean boundary. File artifacts outside native declaration authority without
current ownership evidence remain unowned even if it resembles AXM output.
A generated version-1 marker without generation provenance is owned but of
unknown currency and is rewritten by the next applicable reconciliation.
