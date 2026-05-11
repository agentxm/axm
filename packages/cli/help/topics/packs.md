# Packs

Pack packages live in `./.axm/extensions/<@owner>/packs/<pack-name>`.

## pack.json

[`pack.json`](https://axm.sh/schemas/pack.schema.json)

<!-- axm:embed-schema pack.schema.json -->

## Authoring and editing packs

Run `axm packs new <name>` to scaffold a managed pack. Use `axm packs add <pack> <extension>` and `axm packs remove <pack> <extension>` to edit dependencies when possible.

Run `axm packs publish <pack>` to release a new version. Install with `axm packs install @owner/packs/<name>`.

## Pack dependencies

Bundle extensions by defining the pack dependencies in pack.json:

```
"dependencies": {
  "@acme/skills/brick-building": "*",
  "@acme/subagent/brick-layer": "^1.0.0"
}
```

Use `"*"` to indicate the latest version (recommended) unless there is a specific reason to constrain it.

Packs may not depend on other extension packs. There are no transitive dependencies.

## Recommended packs

Bundled extensions should specify recommended packs to indicate the extension was designed to work with a specified pack:

```
{
   "recommendedPacks": [
      "@acme/packs/bricks"
   ]
}
```

See the individual help topics for each extension type for more details.

## Standalone extensions

For extensions that are not designed to work unless they are bundled with the extensions in the recommended packs, `standalone` should be set to `true` in the manifest for those extensions.

## Where to go next

- `axm packs --help` — full pack subcommand surface.
