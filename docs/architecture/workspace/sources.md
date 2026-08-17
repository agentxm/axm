---
type: Architecture
status: stable
description: How source hosts, immutable identity, and resolution policy constrain external acquisition.
depends-on:
  - ./overview.md
  - ./settings.md
  - ./lockfile.md
---

# Sources and resolution

A source reference says where AXM may resolve or acquire an extension. A source
host supplies the endpoint for a named source scheme. These configuration
choices are separate from desired extension intent and from the immutable
external result accepted in the authoritative lockfile.

## Responsibilities

AXM resolves configured source references through an ordered set of source
hosts. For a project workspace, project definitions take precedence by name,
then user definitions, then built-in defaults. A user workspace uses its own
definitions and built-in defaults. Changing an endpoint does not rewrite an
already accepted source identity.

Version constraints and accepted Pack metadata limit eligible extension
versions. Resolution policy may additionally hold back newly published Registry
releases or exempt explicitly identified extensions. A satisfying locked
resolution remains stable until durable intent requires a different result or
`update` expresses intent to advance it.

Every accepted external result has immutable content identity:

- Registry resolution binds version, extension-archive integrity, and publisher;
- Git resolution binds commit and tree identity; and
- local-path resolution binds a content identity independent of later path
  contents.

## Non-responsibilities

A source host does not declare an extension desired, choose when an accepted
resolution advances, authenticate Registry ownership by itself, or authorize
AXM to overwrite existing content. Release-age exceptions do not bypass source
identity, integrity, publisher binding, ownership, or workspace safety checks.

Source configuration contains endpoints and aliases, not credentials. Runtime
credentials and secret values remain in the user's environment or an external
secret store.

## Resolution boundaries

Workspace settings and authored manifests own durable constraints and desired
routes. Source resolution selects an eligible external result. Verification
establishes its immutable identity, and the lockfile records the accepted
result. Copying source data among those surfaces does not transfer authority.

Sync may resolve a desired external extension that has no lock row. It does not
search for a newer version when the locked resolution still satisfies desired
state. Update owns advancement. A named release-age override is a bounded
resolution-policy choice, not a general force mechanism.

Sync and reinstall reacquire only the exact accepted identity. If a mutable Git
or local-path source changes, moves, or disappears and canonical content is
also unavailable, the affected closure blocks. AXM does not substitute the
source's current bytes. Update may explicitly accept a new result.

## Invariants

- A source name resolves through deterministic scope precedence.
- Source configuration, authored constraints, and accepted lock state remain
  distinct authority.
- Resolution never broadens a user-authored constraint.
- A satisfying accepted resolution prevents incidental advancement.
- Every external source result has immutable accepted content identity.
- Lock-only Pack metadata cannot introduce a desired dependency route.
- Policy exceptions cannot bypass identity, integrity, publisher binding,
  ownership, or atomicity.

## Testing strategy

Behavior tests prove source precedence, same-name overrides, missing hosts,
constraint enforcement, release-age defaults and exemptions, stable accepted
resolution, explicit update advancement, secret exclusion, and independence
among source configuration, desired state, lock state, and observed content.

Registry, Git, and local-path fixtures prove exact rematerialization and block
changed or missing mutable sources from silently substituting new bytes.
