## Context

The lockfile (`axm.lock`) currently stores resolved extension state as JSON. The `schema-lockfile` spec has been updated to require YAML format with filename `axm-lock.yaml`, but the implementation still uses JSON.

The `yaml` library (v2.8.2) is already a dependency in both `@axm.sh/core` and `@axm.sh/cli`.

## Goals / Non-Goals

**Goals:**

- Change lockfile serialization from JSON to YAML
- Rename file from `axm.lock` to `axm-lock.yaml`
- Update all code references and tests

**Non-Goals:**

- Migration of existing `axm.lock` files (no backward compatibility)
- Changing the Effect Schema structure (it validates data, not format)

## Decisions

### Use `yaml` library for serialization

The `yaml` library is already installed. Use `YAML.stringify()` for writing and `YAML.parse()` for reading.

**Alternatives considered:**

- `js-yaml`: Similar capability, but `yaml` is already in deps
- Custom serialization: Unnecessary complexity

### Keep Effect Schema unchanged

The schema (`packages/core/src/schemas/lockfile.ts`) validates the data structure, not the serialization format. No schema changes needed—parse YAML to object, then validate with Effect Schema.

### Filename: `axm-lock.yaml`

Use hyphenated name with `.yaml` extension for consistency with other config files and clear format indication.

**Alternatives considered:**

- `axm.lock.yaml`: Unusual double extension
- `.axm-lock.yaml`: Hidden file, harder to discover
- `axm-lock.yml`: `.yaml` preferred per YAML spec recommendations

## Risks / Trade-offs

**[Risk]** YAML parsing is slightly slower than JSON
→ Lockfile is small and read infrequently; negligible impact

**[Risk]** YAML allows comments which could drift from actual state
→ Accept this; comments can be useful for debugging. Regeneration overwrites them.
