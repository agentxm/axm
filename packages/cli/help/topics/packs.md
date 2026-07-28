# Packs

Pack packages live in `./.axm/extensions/<@owner>/packs/<pack-name>`.

## pack.json

[`pack.json`](https://axm.sh/schemas/pack.schema.json)

Run `axm help pack-schema` to print the raw JSON Schema.

## Authoring and editing packs

Run `axm packs new <name>` to scaffold a managed pack. Use `axm packs add <pack> <extension>` and `axm packs remove <pack> <extension>` to edit dependencies when possible.

Run `axm packs publish <pack>` to release a new version. Install with `axm packs install @owner/packs/<name>`.

## Pack dependencies

Bundle extensions by defining the pack dependencies in `pack.json`. Each key uses the same fully qualified form as the extension directories (`<@owner>/<type>/<name>`, with the plural type segment):

```
"dependencies": {
  "@acme/skills/brick-building": "*",
  "@acme/subagents/brick-layer": "^1.0.0"
}
```

Use `"*"` to indicate the latest version (recommended) unless there is a specific reason to constrain it.

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
- `axm help skills` — the "Lockfile and integrity" section explains the lockfile's `integrity` and `sourceHash` fields; the same model applies to packs and their members
