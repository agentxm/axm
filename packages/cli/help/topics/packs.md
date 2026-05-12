# Packs

Pack packages live in `./.axm/extensions/<@owner>/packs/<pack-name>`.

## pack.json

[`pack.json`](https://axm.sh/schemas/pack.schema.json)

<!-- axm:embed-schema pack.schema.json -->

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

Extensions that are designed to work with a specific pack should declare it in `recommendedPacks`:

```
{
   "recommendedPacks": [
      "@acme/packs/bricks"
   ]
}
```

See the individual help topics for each extension type for more details.

## Standalone extensions

`standalone` defaults to `false`. Set it to `true` only when the extension is meaningless outside its recommended packs. Otherwise leave the field undefined.

## Where to go next

- `axm packs --help` — full pack subcommand surface
