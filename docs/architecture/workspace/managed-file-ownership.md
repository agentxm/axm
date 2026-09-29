---
type: Architecture
status: stable
description: The versioned ownership grammar and reconciliation rules for AXM-managed workspace output.
depends-on:
  - ./overview.md
  - ./execution.md
---

# Managed-file ownership

AXM mutates derived workspace output only when it can prove ownership of the
exact unit being changed. Ownership is explicit, versioned, native to the
target substrate, and independent of human-facing guidance. Unmarked content
is user-owned even when it resembles AXM output or points into a canonical
extension root.

## Encodings

AXM uses one ownership vocabulary through substrate-specific evidence:

- A fence owns a byte range in comment-bearing text.
- A banner owns a whole comment-bearing file.
- An `x-axm` property owns one keyed JSON or YAML entry.
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

A newly reachable extension or native route can create a container that AXM
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

The closed region vocabulary is `rules`, `knowledge`, `hook-fallbacks`,
`instruction-aliases`, and `mcp-server:<name>`. Region identity is the
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

Rules, Knowledge discovery, and Hook fallbacks use generated whole-body
regions. Managed Subagent Markdown, role-skill fallbacks, and instruction
copies use generated whole-file banners.
Instruction alias ignores use a pattern-list region in `.gitignore`. MCP TOML
uses one keyed fence per server. TOML deliberately remains fenced: replacing
the owned byte range avoids an abstract-syntax-tree round trip that could
reformat unrelated user configuration. JSON and YAML MCP entries instead use
an `x-axm` property because those writers already preserve keyed structure.
Pattern lists and execution-bearing native configuration are not opaque
documents. They compare parsed patterns or decoded values, tolerate equivalent
serialization, and rewrite only when those structured values differ. Each
property carries `v`, `managed`, `ext`, `source`, and, for resolvable
sources, `ref`. Inline servers use the workspace-local ownership identity
`@workspace/mcps/<name>` for `ext`; it identifies the managed unit without
claiming a published extension.

Hook command entries use `x-axm` with `v: 1`, `managed: true`, a
`unit: "hook:<name>"`, source, reference, selected scope, and root. A path substring is never an
ownership proof. Whole-file banners lead with `axm:file`; the human-facing
guidance that follows reflects source authority. Workspace-authored packages
name the source to change before sync, workspace configuration names its
configuration source, acquired packages retain immutable provenance and direct
customization through `axm fork`, and bundled sources offer no edit path. The
guidance may change without affecting ownership or requiring a new marker
grammar version.

`axm sync --preview --json` owns convergence: it identifies each managed unit
and exposes its `owner` provenance. `axm lint` reports unowned agent-directory
artifacts, ambiguous unmarked Hook entries, unowned files at planned
instruction targets, stale AXM-owned instruction aliases, tracked instruction
aliases covered by a managed ignore pattern, invalid ownership structures, and
unsupported marker versions. It does not report generated-body currency.

The version-1 ownership grammar remains a clean boundary. Content without
current ownership evidence remains unowned even if it resembles AXM output.
A generated version-1 marker without generation provenance is owned but of
unknown currency and is rewritten by the next applicable reconciliation.
