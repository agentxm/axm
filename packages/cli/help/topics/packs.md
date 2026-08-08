# Packs

Pack packages live in `./.axm/extensions/<@owner>/packs/<pack-name>`.

## pack.json

[`pack.json`](https://axm.sh/schemas/pack.schema.json)

Run `axm help pack-schema` to print the raw JSON Schema.

## Authoring and editing packs

Run `axm packs new <name>` to scaffold a managed pack. Use `axm packs add <pack> <extension>` and `axm packs remove <pack> <extension>` to edit dependencies when possible.

Use `axm packs show <name-or-fqn>` to compare desired membership with the last
successful resolution receipt. If an intentional edit causes trust drift, run
`axm packs repair <name-or-fqn> --preview`, review the classified changes, and
then use `--accept-current`. Repair works from workspace state and canonical
content without Registry access. Reinstall options never accept an
authored pack's changed trust baseline. Never edit `.axm/trust.json` or the
receipt.

Run `axm packs publish <pack>` to release a new version. Install with `axm packs install @owner/packs/<name>`.

When publishing an authored pack, AXM publishes any included workspace-authored
dependencies first, then publishes the pack. Inferred dependencies that are
already published are integrity-verified and skipped; a mismatch blocks the full
selection before any upload. An explicitly selected already-published pack stays
strict unless `--on-existing verify` is supplied.

## Pack dependencies

Bundle extensions by defining the pack dependencies in `pack.json`. Each key uses the same fully qualified form as the extension directories (`<@owner>/<type>/<name>`, with the plural type segment):

```
"dependencies": {
  "@acme/skills/brick-building": "^1.2.3",
  "@acme/subagents/brick-layer": "^1.0.0"
}
```

`axm packs add` writes a caret range from the member's resolved version. This
accepts compatible releases while preserving the version intent observed when
the member was added. A manually authored `"*"` remains valid, but is not the
generated default.

Resolution prefers a matching configured and trusted workspace package. If
that workspace version does not satisfy the constraint, AXM fails without
falling back to the Registry. Registry resolution is used only when there is no
matching configured workspace authority.

Configured pack manifests expand desired state across skills, MCP servers,
subagents, rules, hooks, and knowledge bundles. AXM
keeps owner, type, locator, and constraints when combining direct and pack
origins. A missing or invalid configured manifest makes that desired subtree
unknown and blocks destructive cleanup. Removing a pack retains members still
required directly or by another pack.

At publication time, the Registry requires every dependency to identify a
public, active extension with at least one installable version satisfying the
declared range. Private dependencies are rejected even when the pack is
private. A deprecated dependency remains resolvable but produces a warning.
Publication failures name each unavailable dependency and the corrective action
needed before the pack can be released.

## Cross-extension dependencies and references

Author every non-pack extension as self-contained by default. Its instructions,
configuration, scripts, and runtime behavior must not require or invoke another
extension, reference another extension's files or capabilities, or assume
another extension is installed. Remove the dependency or place the required
material inside the extension.

The only supported exception is deliberate pack composition. The referencing
extension and every required target extension must be direct dependencies of the
same pack. Set the referencing extension to `standalone: false` and name that
shared pack in `recommendedPacks`. A `recommendedPacks` entry is metadata; by
itself, it does not install the pack or its members or guarantee their presence.

Standalone extensions may still belong to packs and may recommend packs when
the relationship is optional. Pack membership alone does not make a member
non-standalone.

Packs install their members together but do not create a shared pack directory
or relative-path namespace. When required coupling uses a sibling file,
reference the target's canonical path from the active AXM scope root:

```text
.axm/extensions/<@owner>/<plural-type>/<name>/src/<path>
```

```markdown
Read `.axm/extensions/@acme/knowledge/shared/src/policies/review.md`.
```

The scope root is the project root for project scope and the user's home
directory for user scope. Cross-extension paths must use forward slashes,
include the target owner, plural type, and name, point inside `src/`, and target
another direct member of the shared pack.

Do not use absolute machine paths, agent projections such as `.agents/skills`
or `.claude/skills`, paths relative to the pack directory, or `..` traversal
between extensions. AXM does not parse, infer, resolve, or rewrite references.
The canonical path remains stable across update, sync, disable/re-enable, and
pack unpack; removing the target extension may break the reference.

## Lifecycle

Packs support the same lifecycle verbs as other extension types:

- `axm packs install <fqn> [--preview]` resolves the complete member graph
  before applying it. The preview names every canonical package that will be
  created or updated and every exclusive package that will be deleted.
- `axm packs update [--preview]` re-resolves every enabled pack's configured
  version constraint and reconciles additions, removals, and shared members.
- `axm packs disable <name> [--preview]` keeps the settings entry, lock data,
  trust baseline, and canonical packages, but removes active artifacts and
  Knowledge discovery contributed only by that pack.
- `axm packs enable <name> [--preview]` restores the pack and its exclusive
  members from retained trusted content without advancing locked versions.
- `axm packs uninstall <name> [--preview]` removes the pack and only members
  whose final origin disappears.
- `axm packs unpack <name> [--preview]` promotes each member to direct settings
  provenance and then removes the pack.

Each verb applies one pack and its complete member graph as a single
transaction. If a pack or member cannot reach its promised postcondition, AXM
rolls back the whole graph. Disabling retains canonical content, trust, and
receipt history for offline re-enable; unpack preserves members by promoting
their provenance in the same transaction that removes the pack.

Direct intent has precedence over membership: an explicit member
`enabled: false` stays disabled even when an enabled pack requires it. A direct
enabled declaration or another enabled pack keeps a shared member active when
one pack is disabled. Preview, list, sync, and JSON output expose the relevant
origins so this precedence is visible.

## No transitive dependencies

Packs may not depend on other extension packs. A pack's dependency graph is exactly the extensions it lists.

## Recommended packs

`recommendedPacks` records metadata and does not install the pack or any of its
members. Extensions designed to work with a specific pack should use the bare
pack reference — do not include a version range:

```
{
   "recommendedPacks": [
      "@acme/packs/bricks"
   ]
}
```

When a pack lists an extension as a dependency and the extension lists that pack as recommended, the registry marks both sides of the relationship as **official**. Either side may declare alone; the badge appears only when both agree.

When you publish both an extension and a pack that bundles it under the same owner, always declare the pack in the extension's `recommendedPacks` — it costs nothing and earns the Official badge in the registry.

See the individual help topics for each extension type for more details.

## Standalone extensions

`standalone` defaults to `true`, and pack membership does not change it. Set it
to `false` only for deliberate required sibling coupling under
[Cross-extension dependencies and references](#cross-extension-dependencies-and-references),
then list the shared pack in `recommendedPacks`. A standalone extension may
still belong to or optionally recommend a pack.

## Where to go next

- `axm packs --help` — full pack subcommand surface
- `axm status` — local reconciliation blockers and recovery actions
- `axm help workspace-state` — desired graph, trust, receipts, and retention
