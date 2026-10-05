---
type: Architecture
status: stable
description: How AXM preserves skill behavior across acquisition, authorship, publication, and native placement.
depends-on:
  - ./overview.md
  - ../decisions/skill-compatibility-is-independent-of-authorship.md
---

# Skills

AXM manages a skill as one content directory. Ownership and distribution may
change; its instructions, frontmatter, supporting files, executable modes, and
contained relative links remain the author's content. The
[decision record](../decisions/skill-compatibility-is-independent-of-authorship.md)
explains this choice. The [specification catalog](../../../specifications/catalog.md)
links the executable obligations and their verification.

## Content and package identity

An upstream skill can be installed directly from its existing directory:

```text
review/
├── SKILL.md
├── scripts/
└── references/
```

An AXM-authored or published skill adds an envelope around that directory:

```text
review-package/
├── skill.json
└── src/
    ├── SKILL.md
    ├── scripts/
    └── references/
```

`src/` is the skill root; it contains `SKILL.md` directly. An individual skill
has no nested `src/skills/<name>`, component selector, or payload-layout setting.
Publishing an existing directory creates the envelope in the archive without
restructuring the source checkout. Import copies the complete directory into
`src/`. Fork changes package metadata while preserving the skill payload.

`skill.json.name` identifies the package. `SKILL.md` frontmatter `name`
identifies the skill and supplies its native directory name. For example,
package `@alice/skills/review-package` can install as
`<agent skills directory>/review/`. There is no additional `skillName` or
`nativeName` manifest field and no requirement that the two identities match.

When the declaration is absent or unusable as a portable path component, AXM
uses its safe selected source or package name, prefixing Windows device names
with `skill-`. It never derives that fallback
from the envelope's physical `src` directory or rewrites the declaration.
The fallback is stable for the same selection across archive wrapping and
reinstallation; choosing a different package identity can change the fallback
of an unnamed skill. A deliberate skill rename is an author's content change.

## No per-agent skill rendering

Every destination receives the same selected skill directory. Agent-specific
integration determines placement and native ownership, not payload content.
AXM does not interpret `agentOverrides`, render conditional Markdown, translate
tool names, strip fields, or turn enforced hooks into advisory prose. Those
bytes remain literal even when an agent does not interpret them.

Compatibility concerns the content, host, and required environment. Authorship
concerns editable ownership and provenance. Taking authorship does not make a
skill more or less portable. Installation proves managed placement and content
preservation; native runtime behavior and task quality require evidence from
the relevant host and evaluation.

An independently published skill contains its required file resources within
its skill root. Moving shared scripts into that root and changing references is
an explicit author edit. An upstream plugin with shared assets retains the
package context described in [Source-compatible distribution](source-compatible-distribution.md).
Converting a plugin component to an independent skill requires making it
independently distributable; retaining plugin files alone does not establish
native plugin activation.

## Validation follows the operation

Discovery extracts available metadata without imposing a conformance gate.
Routine install, sync, and lint check the obligations AXM manages: readable
content, the required entry point, AXM manifests, safe paths, integrity, and
ownership. Unknown native fields, extra files, and unconventional organization
alone do not warrant a warning or failure.

Strict Agent Skills conformance is explicit lint configuration. It is
independent of whether AXM acquired the content or the workspace authored it.
Publication uses the shared envelope and archive admission contract for both
routes, with publisher authority and immutable version rules at the
[publication boundary](../commands/publish.md). It adds no separate authored
skill frontmatter gate. License metadata remains optional; AXM does not infer it.

A warning needs a demonstrated consequence and a useful user decision. A
failure needs a demonstrated inability to satisfy the requested operation.
Unknown metadata alone establishes neither incompatibility nor essentiality.
AXM preserves author-provided fallbacks without inventing behavior or claiming
that a host activates a preserved field.

## Ownership remains exact

Workspace-authored content is editable canonical content. Acquired content is
AXM-managed; native skill directories are projections, whether linked or copied.
One native directory is the ownership unit. A required name occupied by content
AXM cannot prove it owns is a collision, including when two different packages
declare the same skill name. Matching names or bytes alone do not establish
ownership. Disable, removal, and reconciliation use package identity to select
the operation and derived skill identity to locate the native content.
