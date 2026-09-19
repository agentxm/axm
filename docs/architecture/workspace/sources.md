---
type: Architecture
status: stable
description: How AXM turns source locators into accepted external resolutions without confusing acquisition, identity, or local names.
depends-on:
  - "@agentxm/knowledge/agentxm#domain/sources"
  - ./overview.md
  - ./settings.md
  - ./lockfile.md
---

# Sources and resolution

The public AgentXM Knowledge bundle defines [source, source family, locator,
accepted resolution, and local installation
name](https://agentxm.ai/@agentxm/knowledge/agentxm/concepts/domain/sources).
This document owns how AXM realizes those shared concepts. It does not redefine
them.

## Responsibilities

Git, Registry, and path locators are self-describing once AXM accepts them.
Workspace authorship is the fourth source family and uses the intrinsic
settings value `workspace`; it has no external locator or lock row.

Only registries have configured names. The `sources` array maps a name to a
Registry URL, while `defaultRegistry` selects the name used for unqualified
Registry references. Project `defaultRegistry` takes precedence over user
settings, then falls back to the immutable built-in `agentxm` Registry at
`https://registry.agentxm.ai`. A configured registry cannot shadow `agentxm`
or another reserved built-in source name.

The configured name is input shorthand, not locator or lock identity. Once AXM
accepts a Registry result, its lock row records the resolved Registry URL.
Changing a configured name's URL does not rewrite that accepted locator; lint
and sync block until an explicit lifecycle operation accepts the change.

Git shorthands and hosted browser URLs are also input sugar. They normalize to
one Git locator containing a clone URL, optional revision selector, and optional
package path. The accepted locator contains no provider discriminator,
configured source name, or credential. A path locator carries the selected
filesystem path directly.

Version constraints and accepted Pack metadata limit eligible extension
versions. Resolution policy may additionally hold back newly published Registry
releases or exempt explicitly identified extensions. A satisfying accepted
resolution remains stable until durable intent requires a different result or
`update` expresses intent to advance it.

Every accepted external result records locator, declared package identity,
family-specific immutable resolution, and family-independent tree integrity:

- Registry resolution binds version, extension-archive integrity, and publisher;
- Git resolution binds commit and tree identity; and
- path resolution binds a tree identity independent of later path contents.

The local installation name remains the settings key and does not become part
of the source locator or accepted package identity.

## Input and acquisition

`axm install <source>` accepts Registry FQNs, bare GitHub coordinates, hosted
Git shorthand, full Git clone URLs, and paths. Repository discovery selects
manifests by their declared identity; an omitted selector prompts interactively
and requires explicit selectors or `--all` in non-interactive use.

Git acquisition uses credentials already available to the `git` process,
including credential helpers and SSH agents, with terminal prompting disabled.
AXM never stores, forwards, or prints a Git credential. Submodules, Git LFS
object hydration, and symlink materialization are unsupported: selected package
content must consist of ordinary files.

## Package recommendations

Package ecosystem metadata may recommend extensions through the portable
`agentExtensions` contract. A recommendation names a qualified extension
reference and may include a self-contained Registry, Git, or path locator. It
is discovery evidence, not durable desired state: AXM presents or imports the
recommendation through the normal workspace planning boundary before resolving
it.

A recommendation without `source` always means the fixed AgentXM Registry.
Workspace Registry configuration cannot redirect it. A recommendation with
`source` carries its complete acquisition location; only Registry
recommendations may additionally constrain `versionRange`. This keeps package
metadata portable while preserving the distinction between third-party
recommendations and user-authored Registry configuration.

## Non-responsibilities

A source locator does not declare an extension desired, choose when an accepted
resolution advances, authenticate Registry ownership by itself, or authorize
AXM to overwrite existing content. Release-age exceptions do not bypass source
identity, integrity, publisher binding, ownership, or workspace safety checks.

Registry configuration contains endpoints and aliases, not credentials. Git
locators likewise contain no credential. Runtime credentials and secret values
remain in ambient tooling, the user's environment, or an external secret store.

## Resolution boundaries

Workspace settings and authored manifests own durable constraints and desired
routes. Source resolution selects an eligible external result. Verification
establishes its immutable identity, and the lockfile records the accepted
result. Copying source data among those surfaces does not transfer authority.

Sync may resolve a desired external extension that has no lock row. It does not
search for a newer result when the locked resolution still satisfies desired
state. Update owns advancement. A named release-age override is a bounded
resolution-policy choice, not a general force mechanism.

Sync and reinstall reacquire only the exact accepted identity. If a mutable Git
or path source changes, moves, or disappears and canonical content is also
unavailable, the affected closure blocks. AXM does not substitute the source's
current bytes.

Registry updates may advance within their configured version constraints. Git
updates advance branch selectors to a new commit, while tag and commit
selectors hold; a newer semantic-version tag is reported without silently
changing the selector. Path updates may accept the current tree at the declared
path. Every successful advancement records a new accepted resolution.

Installing an already installed FQN from a different authority requests a
source switch. Preview compares the prior and target source, resolution, tree,
dependencies, projections, and Registry-only guarantees; apply replaces the
semantic closure atomically while preserving local intent. Pack switches use
the target manifest as authority and preview a member diff rather than allowing
per-member source selection.

## Publisher trust

A Registry resolution binds the publisher that released the accepted version.
When a later resolution for the same owner and name would replace an accepted
binding with a different publisher, the change is a trust decision rather than
a routine confirmation: the plan carries it as an interactive-only condition,
preview reports it, and only an interactive approval lets install or update
proceed. No consent flag approves it in advance, and unattended or machine
invocations block naming the interactive route. Accepting a binding for the
first time is not a change. [Interaction](../commands/interaction.md) owns the
approval contract.

## Invariants

- Only configured Registry names use settings precedence; Git and path
  locators are self-describing.
- Registry configuration, authored constraints, and accepted lock state remain
  distinct authority.
- Package recommendations do not become desired state or inherit a differently
  configured Registry implicitly.
- Resolution never broadens a user-authored constraint.
- A satisfying accepted resolution prevents incidental advancement.
- Every external source result has a self-describing locator and immutable
  accepted content identity.
- Lock-only Pack metadata cannot introduce a desired dependency route.
- Policy exceptions cannot bypass identity, integrity, publisher binding,
  ownership, or atomicity.
- Replacing an accepted publisher binding requires interactive approval.

## Testing strategy

Behavior tests prove default-Registry precedence, reserved names, changed
Registry endpoints, Git locator normalization, constraint enforcement,
release-age defaults and exemptions, stable accepted resolution, explicit
update and source-switch advancement, secret exclusion, and independence among
Registry configuration, desired state, lock state, and observed content.

Registry, Git, and path fixtures prove exact rematerialization and block changed
or missing mutable sources from silently substituting new bytes.
