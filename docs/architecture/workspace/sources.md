---
status: stable
description: How source hosts and resolution policy constrain external extension acquisition.
depends-on:
  - ./overview.md
  - ./settings.md
  - ./trust.md
---

# Sources and resolution

A source reference says where AXM may resolve or acquire an extension. A source
host supplies the endpoint for a named source scheme. These configuration
choices are separate from desired extension intent, accepted trust and
resolution, and receipt history.

## Responsibilities

AXM resolves configured source references through an ordered set of source
hosts. For a project workspace, project definitions take precedence by name,
then user definitions, then built-in defaults. A user workspace uses its own
definitions and built-in defaults. Changing an endpoint does not silently
rewrite an already accepted source identity.

Version constraints and Pack metadata limit eligible extension versions.
Resolution policy may additionally hold back newly published registry releases
or exempt explicitly identified extensions. A satisfying accepted resolution
in trust remains stable until configuration requires a different result or
update expresses intent to advance it.

## Non-responsibilities

A source host does not declare an extension desired, select an exact version,
establish trust, authenticate a registry identity, or authorize AXM to overwrite
existing content. Release-age exceptions do not bypass source identity,
integrity, ownership, or workspace safety checks.

Source configuration contains endpoints and aliases, not credentials. Runtime
credentials and secret values remain in the user's environment or an external
secret store.

## Resolution boundaries

Workspace configuration and trusted Pack metadata own constraints. Source
resolution selects one eligible result; trust and provenance record the
accepted source and resolution baseline. Receipt history may record the
completed resolution afterward. Copying information among those artifacts does
not transfer their authority.

Sync may resolve an extension that is desired but has no satisfying accepted
resolution. It does not search for a newer version when the trusted resolution
still satisfies desired state. Update owns that advancement. A named
release-age override is a bounded resolution-policy choice, not a general force
mechanism.

## Invariants

- A source name resolves through deterministic scope precedence.
- Source configuration, accepted trust and resolution, and receipt history
  remain distinct state.
- Resolution never broadens a user-authored constraint.
- A satisfying accepted resolution prevents incidental version advancement.
- Receipt history never influences source selection or resolution.
- Policy exceptions cannot bypass trust, integrity, ownership, or atomicity.

## Testing strategy

Behavior tests prove source precedence, same-name overrides, missing hosts,
constraint enforcement, release-age defaults and exemptions, stable accepted
resolution, explicit policy bypass, secret exclusion, and independence among
source configuration, trust, observed state, and receipt history.
