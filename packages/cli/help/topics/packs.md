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
content without Registry access. Never edit `.axm/trust.json` or the receipt.

Run `axm packs publish <pack>` to release a new version. Install with `axm packs install @owner/packs/<name>`.

When publishing an authored pack, AXM publishes any included workspace-authored
dependencies first, then publishes the pack. Existing dependency versions are
verified instead of republished, so retrying a partially completed publication
is safe.

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

## Lifecycle

Packs support the same lifecycle verbs as other extension types:

- `axm packs update [--preview]` re-resolves every enabled pack's configured
  version constraint and reconciles additions, removals, and shared members.
- `axm packs disable <name> [--preview]` keeps the settings entry, lock data,
  trust baseline, and canonical packages, but removes projections contributed
  only by that pack.
- `axm packs enable <name> [--preview]` restores the pack and its exclusive
  members from retained trusted content without advancing locked versions.

Direct intent has precedence over membership: an explicit member
`enabled: false` stays disabled even when an enabled pack requires it. A direct
enabled declaration or another enabled pack keeps a shared member active when
one pack is disabled. Preview, list, sync, and JSON output expose the relevant
origins so this precedence is visible.

## No transitive dependencies

Packs may not depend on other extension packs. A pack's dependency graph is exactly the extensions it lists.

## Recommended packs

Extensions that are designed to work with a specific pack should declare it in `recommendedPacks`. Use the bare pack reference — do not include a version range:

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

`standalone` defaults to `true`. Set it to `false` only when the extension is meaningless outside its recommended packs — and then list at least one pack in `recommendedPacks`. Otherwise leave the field undefined.

## Where to go next

- `axm packs --help` — full pack subcommand surface
- `axm status` — local reconciliation blockers and recovery actions
- `axm help workspace-state` — desired graph, trust, receipts, and retention
