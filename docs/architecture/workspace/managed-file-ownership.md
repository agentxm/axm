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
is user-owned even when it resembles AXM output or points into
`.axm/extensions/`.

## Encodings

AXM uses one ownership vocabulary through four substrate encodings:

- A fence owns a byte range in comment-bearing text.
- A banner owns a whole comment-bearing file.
- An `x-axm` property owns one keyed JSON or YAML entry.
- A symlink whose resolved target is inside `.axm/extensions/` proves
  structural ownership without a marker.

The canonical comment-bearing grammar is:

```text
axm:start v=1 region=<id> [ext=<fqn>]
axm:end v=1 region=<id>
axm:file v=1 ext=<fqn> src=<path>
axm:point v=1 kind=<kind> ext=<fqn>
```

The target file supplies the native comment delimiters: Markdown and HTML use
`<!-- -->`, CSS uses `/* */`, supported programming languages use `//`, and
shell-like formats and explicitly allowed basenames use `#`. AXM refuses
unknown extensions and JSON-like dotfiles because guessing a comment syntax
could corrupt user data.

The closed region vocabulary is `rules`, `knowledge`, `hook-fallbacks`,
`instruction-aliases`, and `mcp-server:<name>`. Region identity is the
`region` value alone. `ext`, `src`, and unknown version-1 attributes are
provenance and do not change identity.

Serialization orders attributes as `v`, `region`, `ext`, `src`, then any
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

Managed-region comparison ignores formatter-only changes such as line-ending
choice, prose soft wrapping, trailing whitespace, and Markdown table-cell
padding. AXM emits no formatter directives. User-authored bytes outside an
owned unit remain unchanged, and ambiguous ownership causes no write.

Rules, Knowledge discovery, and Hook fallbacks use whole-body regions.
Instruction alias ignores use a pattern-list region in `.gitignore`. MCP TOML
uses one keyed fence per server. TOML deliberately remains fenced: replacing
the owned byte range avoids an abstract-syntax-tree round trip that could
reformat unrelated user configuration. JSON and YAML MCP entries instead use
an `x-axm` property because those writers already preserve keyed structure.
Each property carries `v`, `managed`, `ext`, `source`, and, for resolvable
sources, `ref`. Inline servers use the workspace-local ownership identity
`@workspace/mcps/<name>` for `ext`; it identifies the managed unit without
claiming a published extension.

Hook command entries use `x-axm` with `v: 1`, `managed: true`, a
`unit: "hook:<name>"`, source, and reference. A path substring is never an
ownership proof. Whole-file banners lead with `axm:file`; the numbered prose
that follows is guidance and may change without affecting ownership.

`axm sync --preview --json` identifies each managed-region unit and exposes
its `owner` provenance. `axm lint` reports unowned agent-directory artifacts,
ambiguous unmarked Hook entries, tracked instruction aliases covered by a
managed ignore pattern, malformed regions, and unsupported marker versions.

## One-time pre-launch cutover

The version-1 grammar is a clean break. AXM has no legacy reader, dual writer,
or compatibility migration. For each known workspace—`agentxm-internal`,
`axm`, `riverstone-examples`, `polyglot-examples`, and `community`—perform this
one-time procedure:

1. Remove the complete stale AXM-derived block, including both old markers.
   Preserve all prose outside it.
2. Remove old AXM-managed alias copies or Hook/MCP entries only when their
   prior ownership is known independently; preserve ambiguous content.
3. Run the current `axm sync` to render version-1 units.
4. Run the workspace formatter, then `axm sync --preview --fail-on-change`.
5. Run `axm lint` and resolve every ownership or ambiguity finding.

The final preview must exit successfully without proposing changes. Repeating
the procedure is unnecessary once every derived unit carries version-1
ownership.
