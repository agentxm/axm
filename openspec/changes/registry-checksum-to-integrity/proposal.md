## Why

The registry uses `checksum` with a custom `sha256:<hex>` format throughout. As we build the remote registry client, adopting the industry-standard SRI (Subresource Integrity) format (`sha512-<base64>`) and the `integrity` field name aligns with npm, pnpm, and yarn conventions. SRI is self-describing (algorithm is part of the string), uses a stronger hash (SHA-512), and makes the remote registry protocol familiar to the ecosystem.

## What Changes

- **BREAKING** Rename `checksum` to `integrity` across all types: `RegistryExtensionEntry`, `RegistryRefDetails`, `VersionEntry` schema, and all source ref types
- **BREAKING** Change format from `sha256:<hex>` to SRI format `sha512-<base64>`
- Update `computeChecksum` utility to produce SRI strings (rename to `computeIntegrity`)
- Update integrity verification in registry fetch to use the new format
- Update publish flow to compute and store SRI integrity values
- Update lockfile entries that store checksums

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `registry-client`: `RegistryExtensionEntry.checksum` becomes `integrity` with SRI format; verification and idempotency checks use the new field
- `registry-publish`: Checksum computation produces SRI format; stored as `integrity` in `index.json`
- `registry-layout`: `VersionEntry` schema field renamed from `checksum` to `integrity`
- `source-domain-model`: `RegistryRefDetails.checksum` becomes `integrity`; all registry ref types updated
- `source-provider`: Registry provider verification and ref population use `integrity` field
- `extension-packs`: Pack lock entry field `checksum` becomes `integrity`
- `cli-packs-publish`: Checksum computation and idempotency scenarios use `integrity`
- `builtin-pack`: Builtin pack/skill lock entry exclusion lists updated (`checksum` → `integrity`)

## Impact

- **Registry index files** (`index.json`): `VersionEntry.checksum` → `integrity`, format changes to SRI — existing registries need republishing
- **Lockfile** (`axm-lock.yaml`): `RegistryLockEntrySchema.checksum` and `RegistryPackLockEntrySchema.checksum` → `integrity` — existing lockfiles need reinstall
- **Source domain types**: `RegistryRefDetails.checksum` → `integrity`; all registry ref types (`RegistrySkillRef`, `RegistryMcpServerRef`, `RegistryPackRef`) updated
- **Registry client**: `RegistryExtensionEntry.checksum` → `integrity`; verification logic uses SHA-512
- **Publish flows**: Both `publish-skill.ts` and `publish-pack.ts` import and use renamed utility
- **Host provider**: `host-provider.ts` verification and error messages updated (2 fetch paths: skill and mcp-server)
- **Lock entry mapping**: `source-to-lock-entry.ts` maps `integrity` instead of `checksum`
- **Utility**: `utils/checksum.ts` → `utils/integrity.ts`; `computeChecksum` → `computeIntegrity`; `utils/index.ts` re-export updated
- **Tests**: ~15 test files with fixtures/assertions referencing `checksum` / `sha256:` patterns
