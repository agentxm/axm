## Context

The registry currently uses a custom `sha256:<hex>` format for content hashes, stored in a field called `checksum`. This appears in:

- `VersionEntrySchema.checksum` (registry `index.json`)
- `RegistryExtensionEntry.checksum` (client search results)
- `RegistryRefDetails.checksum` (source extension refs)
- `RegistryLockEntrySchema.checksum` / `RegistryPackLockEntrySchema.checksum` (lockfile)
- `computeChecksum()` utility

The remote registry client is being built. Adopting SRI format now avoids shipping a custom format over the wire and aligns with package manager conventions.

## Goals / Non-Goals

**Goals:**

- Rename `checksum` → `integrity` across all types, schemas, and interfaces
- Adopt SRI format: `sha512-<base64>` (SHA-512, base64-encoded, dash separator)
- Rename `computeChecksum` → `computeIntegrity`
- Keep the change mechanical — same verification semantics, same code paths

**Non-Goals:**

- Supporting multiple hash algorithms simultaneously
- Backward compatibility with existing `sha256:<hex>` values
- Migration tooling for existing registries or lockfiles (republish/reinstall)

## Decisions

### Decision: SRI format with SHA-512

Use the W3C Subresource Integrity format: `<algorithm>-<base64-hash>`.

- Algorithm: `sha512` (stronger than sha256, matches npm convention)
- Encoding: base64 (SRI spec requirement)
- Separator: `-` (not `:`)

Example: `sha512-vGVP+...==`

**Why not keep sha256?** SHA-512 is actually faster on 64-bit CPUs due to native word size. SRI format is self-describing, so algorithm upgrades don't require field name changes. Matches npm/pnpm/yarn.

**Why not support both algorithms?** Over-engineering for a pre-1.0 system with no existing remote consumers. Single algorithm keeps verification simple.

### Decision: `node:crypto` for hashing

Continue using `node:crypto` (already used by `computeChecksum`). Change from:

```typescript
createHash("sha256").update(data).digest("hex");
// → "sha256:abc123..."
```

To:

```typescript
createHash("sha512").update(data).digest("base64");
// → "sha512-vGVP+...=="
```

### Decision: Rename field everywhere, no aliases

Straight rename `checksum` → `integrity` in all types and schemas. No deprecated aliases or transition period — this is a breaking change across:

- `VersionEntrySchema` (registry index)
- `RegistryExtensionEntry` (client interface)
- `RegistryRefDetails` (source domain)
- `RegistryLockEntrySchema` / `RegistryPackLockEntrySchema` (lockfile)

### Decision: Utility rename

`computeChecksum` → `computeIntegrity` in `utils/checksum.ts`. Rename the file to `utils/integrity.ts`.

## Risks / Trade-offs

**Existing local registries break** → Acceptable. Pre-1.0, no published remote registries. Users republish with `skills publish` / `packs publish`.

**Existing lockfiles break** → Acceptable. Users reinstall. The lockfile is a cache, not user-authored content.

**SHA-512 produces longer strings** → Base64 SHA-512 is 88 chars vs hex SHA-256's 64 chars. Negligible impact on index.json and lockfile size.
