## Why

When installing an extension pack from a registry, the pack's skill dependencies are recorded as metadata but never physically installed. Users expect `axm packs install` to install the pack _and_ its referenced skills in one operation, with all dependencies visible in the install plan.

## What Changes

- Pack install plan includes skill install operations for each skill listed in the pack manifest's `skills` map
- Skills referenced by the pack are fetched from the registry and installed alongside the pack
- Already-installed skills are shown as no-op in the plan (skipped unless `--force`)
- Pack operation is ordered before its skill dependency operations in the plan

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `cli-packs-install`: Install plan now includes skill dependency operations from the pack manifest, not just the pack itself

## Impact

- Pack install handler gains dependency fetching and combined plan building
- Pack install plan builder accepts mixed operation types (pack + skill)
- Existing skill install infrastructure (`installSkill` handler, `SourceProviders`) is reused with no changes
