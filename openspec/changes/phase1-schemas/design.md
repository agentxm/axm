## Context

AXM requires validated data structures for extension manifests, configuration, and state tracking. The proposal.md defines these structures but we need runtime validation and JSON Schema generation for external tooling.

Current state: No schema definitions exist. The proposal.md contains informal field tables that need formalization.

## Goals / Non-Goals

**Goals:**

- Define Effect schemas that match proposal.md specifications exactly
- Generate JSON schemas for documentation and external validation
- Establish patterns for future schema additions
- Provide TypeScript types inferred from schemas

**Non-Goals:**

- Custom validation error messages (use Effect defaults)
- Schema versioning or migrations
- Runtime schema composition beyond what's defined

## Decisions

### 1. Use @effect/schema for all definitions

**Rationale**: Already in tech stack, provides TypeScript inference, supports JSON Schema generation via `@effect/schema/JSONSchema`.

**Alternatives considered**:

- Zod: Would require additional dependency, less integrated with Effect ecosystem
- io-ts: Older, less active development
- Manual TypeScript types + JSON schemas: Duplication, drift risk

### 2. File organization: one file per schema type

```
packages/core/src/schemas/
├── index.ts              # Re-exports all schemas
├── common.ts             # Shared fields (Author, common manifest fields)
├── manifest-skill.ts
├── manifest-command.ts
├── manifest-pack.ts
├── manifest-mcp-server.ts
├── settings.ts
├── lockfile.ts
└── __generated__/        # Generated JSON schemas
    ├── axm-skill.schema.json
    ├── axm-command.schema.json
    ├── axm-pack.schema.json
    ├── axm-mcp-server.schema.json
    ├── settings.schema.json
    └── axm-lock.schema.json
```

**Rationale**: Colocates related code, clear ownership, easy to navigate.

### 3. Common fields via Schema composition

Extract shared manifest fields into `common.ts` and compose into each manifest schema.

```typescript
// common.ts
export const Author = Schema.Struct({
  name: Schema.String,
  email: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
});

export const CommonManifestFields = {
  name: Schema.String.pipe(Schema.pattern(/^@[\w-]+\/[\w-]+$/)),
  version: Schema.String, // semver
  description: Schema.optional(Schema.String),
  keywords: Schema.optional(Schema.Array(Schema.String)),
  repository: Schema.optional(Schema.String),
  homepage: Schema.optional(Schema.String),
  license: Schema.optional(Schema.String),
  bugs: Schema.optional(Schema.String),
  author: Schema.optional(Author),
};

// manifest-skill.ts
export const SkillManifest = Schema.Struct({
  ...CommonManifestFields,
  // skill-specific fields if any
});
```

### 4. JSON Schema generation as build script

Add `pnpm generate:schemas` script that:

1. Imports each Effect schema
2. Calls `JSONSchema.make()` on each
3. Writes to `__generated__/` directory

**Rationale**: Generated files are checked in for discoverability, script ensures they stay in sync.

### 5. Enums for constrained string fields

Use `Schema.Literal` unions for fields with known values:

```typescript
export const ExtensionType = Schema.Union(
  Schema.Literal("skill"),
  Schema.Literal("command"),
  Schema.Literal("pack"),
  Schema.Literal("mcp-server"),
);

export const SourceType = Schema.Union(
  Schema.Literal("github"),
  Schema.Literal("gitlab"),
  Schema.Literal("bitbucket"),
  Schema.Literal("azuredevops"),
  Schema.Literal("git"),
  Schema.Literal("url"),
  Schema.Literal("path"),
  Schema.Literal("registry"),
);
```

## Risks / Trade-offs

**[Risk] JSON Schema drift** → Generated schemas are checked in; CI can verify they're up to date by re-running generation and checking for diff.

**[Risk] Complex nested structures in settings.json** → Start with flat structure where possible; settings.sources and settings.agents have well-defined shapes from proposal.

**[Trade-off] Generated files in repo** → Increases repo size slightly but improves discoverability and allows external tools to reference schemas without running build.
