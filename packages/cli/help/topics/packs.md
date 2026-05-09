# Packs

Pack packages live in `./.axm/extensions/<@owner>/packs/<pack-name>`.

## pack.json

[`pack.json`](https://axm.sh/schemas/pack.schema.json)

<!-- axm:embed-schema pack.schema.json -->

## Authoring and editing packs

Run `axm packs new <name>` to scaffold a managed pack. Use `axm packs add <pack> <extension>` and `axm packs remove <pack> <extension>` to edit dependencies when possible.

Run `axm packs publish <pack>` to release a new version. Install with `axm packs install @owner/packs/<name>`.

## Where to go next

- `axm packs --help` — full pack subcommand surface.
