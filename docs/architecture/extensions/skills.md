---
type: Architecture
status: stable
description: How AXM preserves skill behavior across acquisition, authorship, publication, and native placement.
depends-on:
  - ./overview.md
  - ../decisions/skill-compatibility-is-independent-of-authorship.md
---

# Skills

AXM manages Agent Skills content and makes it available through configured
agents' skill surfaces. A skill may be portable or depend on native host
behavior. AXM adds ownership, distribution, and lifecycle management while
preserving the author's intended behavior.

This document owns the design principles for that boundary. The
[decision record](../decisions/skill-compatibility-is-independent-of-authorship.md)
explains the choice; executable specifications own accepted functional
requirements. Adoption of these principles is not evidence that every current
validation or publication path already implements them.

## Compatibility and authorship are independent

Compatibility concerns the skill, the selected host, and its required
environment. Authorship concerns editable ownership and provenance. Acquired
skills can be portable, and workspace-authored skills can use native host
features. Adopting unchanged content does not change its compatibility or
require a rewrite into a universal portable baseline.

Successful installation means AXM preserves the selected payload and its
package context and places it where the supported host can discover and load
it. It does not certify task quality, install prerequisites inferred from
prose, or prove behavior on every agent implementing the Agent Skills format.
Claims about runtime behavior need evidence from that host; claims about task
quality need behavioral evaluation.

The portable baseline and capability-conditioned enhancements described in
[Agent-specific extension content](targeting.md) remain useful for skills that
choose that contract. They are not a prerequisite for managing every skill.

## Preserve meaning through the lifecycle

Acquisition, adoption for authorship, publication, and reinstallation preserve
effective behavior on the same supported host when content and environment
have not changed. Supporting files, relative layout, executable modes, and
package context are part of the payload, not incidental decoration.

Unknown frontmatter and native fields remain unchanged. AXM does not remove,
rename, or relocate them under generic metadata merely to pass its validator.
It validates fields it interprets or transforms against the contract of the
requested operation. Preserving an opaque field does not claim that AXM or
every host understands or activates it.

A host-native control can be essential or optional. A known inability to
realize required behavior blocks the affected activation. A known loss of an
optional enhancement can warrant an actionable warning. AXM preserves an
author-provided fallback; it does not invent an advisory instruction as a
substitute for an enforced control. Unknown fields alone establish neither
incompatibility nor essentiality.

## Diagnostics justify their interruption

Routine install, sync, adoption, and publication diagnose operational
consequences. They do not turn authoring preferences or unproven portability
into default errors or warnings.

| Condition                                                                                                 | Response                                                            |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Unfamiliar metadata, extra files, or unconventional organization with no demonstrated operational problem | Preserve silently.                                                  |
| Style preference or stricter standard-conformance advice                                                  | Report through explicitly requested conformance or quality checks.  |
| Known unavailable optional behavior that affects a useful user decision                                   | Warn with the affected host and consequence.                        |
| Known host rejection or inability to realize required behavior                                            | Fail the affected activation before committing a misleading result. |
| Integrity failure, unsafe package paths, or conflicting native ownership                                  | Fail the affected operation.                                        |
| Missing identity, authority, version, or legal declaration required for distribution                      | Fail publication at its owning boundary.                            |

A warning needs a known consequence and a useful decision. An unfamiliar key
or an untested host is insufficient by itself. Compatibility evidence and
uncertainty can be inspectable without adding routine warning noise. Strict
standard conformance and stronger portability claims are explicit checks,
separate from the minimum needed to perform an operation safely and honestly.

## Publication adds a distribution contract

Making a skill AXM-managed or publishing it to the Registry does not imply
broadening its supported hosts. Publication adds the identity, publisher
authority, immutable version, legal declaration, safe artifact structure, and
discovery information required by the
[publication boundary](../commands/publish.md). Each admission constraint needs
a concrete distribution or consumer requirement.

The existing directory can remain intact with an AXM distribution envelope;
publication need not force a new source layout or normalize native fields.
[Source-compatible distribution](source-compatible-distribution.md) owns that
package and acquisition model. More demanding authoring advice belongs in an
explicit check, not an implicit cost of adoption or Registry distribution.

## Authority and ownership

Workspace-authored skill content is editable canonical content. Canonical
content acquired from an external source is AXM-managed. Agent skill
directories are projections, whether a particular writer uses links or copies.
A projection never becomes an authoring source through incidental edits.

One agent-facing Skill directory is the native ownership unit. Directories
with different names can coexist regardless of installer. A required name
occupied by a directory or link AXM cannot prove it owns is a collision.
A matching name or matching files are not sufficient ownership evidence;
reconciliation never adopts or overwrites an unowned directory.

AXM management identity, upstream declared identity, and native placement stay
traceable without rewriting upstream bytes to make their strings equal.
Coupling to another AXM extension uses explicit Pack composition and extension
identity with host discovery, never a hidden path into another extension.
Supporting files inside one selected upstream package retain their own context.

## Implementation alignment and verification

Current acquired-content metadata extraction is permissive, while authored
frontmatter validation and authored publication still apply a stricter field
contract. Those paths are an implementation gap against these principles;
this design change does not alter their executable requirements. Convergence
requires coordinated specification and implementation changes at each owner.

Verification should cover the whole journey: install an existing source,
adopt for authorship, publish, and install that version on the same supported
host. Evidence must establish payload/context preservation and the selected
host behavior, including native controls and author-provided fallbacks.
Management success alone cannot establish runtime equivalence.

Keep the existing ownership, collision, drift, disable/re-enable, safe removal,
and idempotence coverage. Add decisive cases for harmless unknown fields,
actual host rejection, missing required behavior, useful optional-behavior
diagnostics, and publication admission. Concrete field interpretations,
essentiality declarations, and any necessary host adaptation remain design
choices to resolve from supported cases, not a new generic capability framework
implied by these principles.
