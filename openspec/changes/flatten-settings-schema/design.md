## Context

The current `Settings` schema wraps extension types under an `extensions` object:

```json
{
  "scope": "@wayne",
  "sources": { ... },
  "agents": ["claude-code"],
  "extensions": {
    "skills": { "@wayne/grappling-hook": "^1.0.0" },
    "mcp-servers": { "@wayne/batcomputer": "^2.0.0" }
  }
}
```

This adds unnecessary nesting. Most config files (package.json, tsconfig, etc.) place related fields at the root level.

## Goals / Non-Goals

**Goals:**

- Flatten `skills`, `commands`, `packs`, `mcp-servers` to root level
- Update all code paths that read/write settings
- Regenerate JSON schema

**Non-Goals:**

- Migration path from old format (breaking change, no backward compatibility)
- Changing the structure of individual extension maps

## Decisions

### Flatten ExtensionsConfig fields to Settings root

Move the four extension type fields directly into the `Settings` schema:

```typescript
// Before
export const Settings = Schema.Struct({
  scope: Schema.optional(Schema.String),
  sources: Schema.optional(SourcesConfig),
  agents: Schema.optional(Schema.Array(AgentId)),
  extensions: Schema.optional(ExtensionsConfig),
});

// After
export const Settings = Schema.Struct({
  scope: Schema.optional(Schema.String),
  sources: Schema.optional(SourcesConfig),
  agents: Schema.optional(Schema.Array(AgentId)),
  skills: Schema.optional(ExtensionMap),
  commands: Schema.optional(ExtensionMap),
  packs: Schema.optional(ExtensionMap),
  "mcp-servers": Schema.optional(ExtensionMap),
});
```

**Rationale:** Reduces nesting, aligns with common config patterns, simpler access paths.

**Alternative considered:** Keep `extensions` wrapper but allow both formats. Rejected—adds complexity for no benefit since backward compatibility is a non-goal.

### Remove ExtensionsConfig schema

The `ExtensionsConfig` wrapper type becomes unnecessary and should be removed.

**Rationale:** Dead code after flattening.

## Risks / Trade-offs

- **Breaking change** → All existing settings.json files need manual update. Acceptable since this is pre-release.
- **Larger Settings type** → Four more optional fields at root. Acceptable trade-off for simpler API.
