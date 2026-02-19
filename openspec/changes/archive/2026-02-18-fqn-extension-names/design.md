## Context

Extension names currently use a two-segment format `@scope/name` (e.g., `@acme/code-review`). The extension type (skill, pack, mcp-server) is determined from context — the command being run, the section of a manifest it appears in, or runtime resolution. This creates ambiguity: `@acme/code-review` could be a skill, pack, or MCP server.

Several parts of the codebase already use three-segment paths internally:

- **Registry directory layout**: `extensions/@scope/skills/name/`
- **Registry client API**: accepts separate `scope`, `type`, `name` fields
- **Managed extension storage**: `.axm/extensions/@scope/skills/name/`
- **Input parser**: already recognizes `@scope/skills/name` as a registry pattern
- **Pack publish**: transforms 2-segment manifest keys to 3-segment lockfile keys via `flattenManifestDeps`

The two-segment FQN is a legacy artifact used in: the `FQN_PATTERN` regex, pack manifest dependency keys, lockfile resolved extension maps, the `parseScopedName` utilities, and display formatting. This design migrates all remaining two-segment usage to three-segment.

## Goals / Non-Goals

**Goals:**

- Single canonical FQN format `@scope/type-plural/name` used everywhere
- Remove the legacy two-segment fallback in the input parser
- Remove the `flattenManifestDeps` transformation layer (manifests use 3-segment directly)
- All FQN construction, parsing, and validation goes through shared utilities

**Non-Goals:**

- Backward compatibility with existing two-segment lockfiles or manifests (breaking is acceptable per rules)
- Changes to settings schema (settings uses simple unscoped names, not FQNs)
- Changes to registry client interface (already uses separate scope/type/name fields)
- Changes to registry directory layout (already three-segment)

## Decisions

### 1. FQN canonical format: `@scope/type-plural/name`

The type segment uses **plural form** matching the existing directory convention: `skills`, `packs`, `mcp-servers`.

**Rationale**: Registry paths, managed extension paths, and the input parser already use plural forms. Using singular would require a mapping layer.

**Alternative considered**: Singular type (`@scope/skill/name`). Rejected because it would diverge from existing directory conventions and require pluralization during path construction.

### 2. Update FQN_PATTERN to accept only three-segment format

Replace `FQN_PATTERN = /^@[\w-]+\/[\w-]+$/` with a pattern matching `@scope/type-plural/name` where type-plural is one of `skills|packs|mcp-servers`.

```
/^@[\w-]+\/(skills|packs|mcp-servers)\/[\w-]+$/
```

**Rationale**: Since backward compatibility is a non-goal, a clean break is simpler than supporting both formats. The regex validates the type segment structurally.

### 3. New `parseFqn` / `formatFqn` utilities replace `parseScopedName`

Introduce focused utilities in a new `extensions/fqn.ts` module:

- `parseFqn(input: string): Effect<Fqn, CliError>` — parse `@scope/type-plural/name` into `{ scope, type, name }`
- `parseFqnOrThrow(input: string): Fqn` — throwing variant for boundaries
- `formatFqn(fqn: Fqn): string` — construct `@scope/type-plural/name` from parts
- `Fqn` type: `{ readonly scope: string; readonly type: ExtensionTypePlural; readonly name: string }`

Where `ExtensionTypePlural = "skills" | "packs" | "mcp-servers"`.

**Rationale**: Co-locating FQN logic with extensions (not buried in `cli-commands/skills/naming.ts`) reflects that FQNs are a cross-cutting extension concern. The `naming.ts` functions `parseScopedName` and `hasScopePrefix` are removed — all callers migrate to `parseFqn`.

**Alternative considered**: Extending `parseScopedName` to return an optional type segment. Rejected because the return type changes (`{ scope, name }` → `{ scope, type, name }`) and the function name no longer describes its purpose.

### 4. Pack manifests use three-segment FQN keys directly

Pack `axm-pack.json` dependency keys change from `@scope/name` to `@scope/type-plural/name`:

```json
{
  "skills": { "@acme/skills/code-review": "^1.0.0" },
  "mcp-servers": { "@acme/mcp-servers/db-connector": "^2.0.0" }
}
```

**Rationale**: Eliminates `flattenManifestDeps` — the transformation from 2-segment to 3-segment becomes unnecessary. The manifest key is the canonical FQN, same as everywhere else. The `skills`/`mcp-servers` section keys in the manifest provide structural grouping; the FQN in each key provides unambiguous identity.

**Alternative considered**: Keep 2-segment in manifests, transform on read. Rejected because it preserves the dual-format complexity and backward compatibility is a non-goal.

### 5. Lockfile resolved extension maps keep `Schema.String` keys

The `ResolvedExtensionMapSchema` key type stays as `Schema.String`. The keys are now three-segment FQNs but schema-level validation via `FQN_PATTERN` is not added to the lockfile — the lockfile is machine-written and trusted.

**Rationale**: Adding FQN pattern validation to the lockfile schema risks breaking lockfile reads on format transitions. The lockfile is written by axm, not hand-edited.

### 6. Remove legacy two-segment fallback in parser

In `sources/parser.ts`, the branch at line 193-204 that defaults `@scope/name` to `type: Some("skills")` is removed. Two-segment `@scope/name` input will no longer be recognized as a registry pattern — users must provide the type segment.

**Rationale**: Clean break. The parser already handles `@scope/type-plural/name` and `@scope/type-plural` (scope+type browse). Two-segment without type is genuinely ambiguous.

### 7. Module location for FQN utilities

New file: `packages/cli/src/extensions/fqn.ts` with barrel export from `extensions/index.ts`.

**Rationale**: FQNs are an extension-level concept. The `common.ts` file keeps `FQN_PATTERN` and `FullyQualifiedNameSchema` (they're schema concerns), while `fqn.ts` holds runtime parsing/formatting. The existing `cli-commands/skills/naming.ts` is deleted — its `hasScopePrefix` helper is trivially inlined where needed.

### 8. Display formatting uses `formatFqn`

All template literal FQN construction (`\`${scope}/${name}\``, `\`${scope}/${typePlural}/${name}\``) is replaced with `formatFqn({ scope, type, name })`. This ensures consistent formatting and makes FQN construction greppable.

## Risks / Trade-offs

- **Existing lockfiles break** → Acceptable per non-goal. Users run `axm init` or reinstall. No migration code.
- **Existing pack manifests break** → Acceptable. Pack authors update dependency keys. Error messages from schema validation will indicate the required format.
- **Verbosity increase** → `@acme/skills/code-review` is longer than `@acme/code-review`. Acceptable trade-off for unambiguous identification.
- **Type segment redundancy in pack manifests** → The `"skills"` section key and the `skills` segment in the FQN key repeat the type. Acceptable because it makes each key self-describing and eliminates the transformation layer.

## Open Questions

None — the codebase already demonstrates the three-segment pattern in registry paths, managed extension storage, and the input parser. This change aligns the remaining two-segment holdouts.
