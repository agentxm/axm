## Why

Users often provide a package name like `effect-basics` and expect `axm` to resolve it from configured registries. Today this fails early as `INVALID_SOURCE`, which hides whether the name was checked in registries and makes the install flow feel brittle.

## What Changes

- Treat bare source values (for example `effect-basics`) as a lookup candidate instead of immediate invalid input.
- Resolve bare names against available registries using the default namespace before reporting source-format errors.
- If a match is found, continue install using the resolved registry source.
- If no match is found, report that registry lookup was attempted and list where it was checked.
- Improve CLI feedback so users can distinguish format errors from "not found in registries" results.

## Capabilities

### New Capabilities

- `default-namespace-registry-lookup`: Resolve bare install names by searching configured registries under the default namespace and surface explicit not-found feedback when no match exists.

### Modified Capabilities

- None.

## Impact

- Affected areas: install-source parsing/normalization, registry lookup path, and CLI error/reporting output for install commands.
- User-visible behavior: short names become discoverable through registries; failures become actionable because lookup attempts are shown.
- Testing: add coverage for successful bare-name resolution and explicit "checked but not found" output.
