## Context

Current `cli/src/schemas/` contains:

- **Lockfile schemas**: `lockfile.ts` - workspace lock state
- **Settings schemas**: `settings.ts` - user/workspace settings
- **Extension common**: `common.ts`, `extension-sources.ts` - shared types for all extensions
- **Manifest schemas**: `manifest-skill.ts`, `manifest-command.ts`, `manifest-mcp-server.ts`, `manifest-pack.ts`

Current `cli/src/skills/` contains skill-specific logic (discovery, git integration, state management).

These are unrelated domains mixed in one folder. As we add more extension types (commands, packs, mcp-servers), this won't scale.

## Goals / Non-Goals

**Goals:**

- Co-locate related code by domain (lockfile, settings, extensions)
- Establish consistent structure for extension types
- Make it obvious where new extension-type code belongs

**Non-Goals:**

- Changing any behavior or APIs
- Adding new functionality
- Optimizing imports or bundle size

## Decisions

### 1. Top-level domain folders for lockfile and settings

Move lockfile and settings schemas to dedicated top-level folders:

- `cli/src/lockfile/schema.ts`
- `cli/src/settings/schema.ts`

**Rationale**: These are distinct domains that will grow (lockfile already has multiple files in skills/). Top-level folders make them discoverable and allow future expansion.

**Alternative**: Keep in schemas/ with subfolders. Rejected because lockfile/settings aren't "schemas" - they're domains that happen to have schemas.

### 2. Extensions folder groups all extension-type code

Create `cli/src/extensions/` with subfolders per type:

```
extensions/
├── common.ts           # Shared types (ExtensionType, Author, etc.)
├── sources.ts          # Extension source schemas (renamed from extension-sources.ts)
├── skills/
│   ├── manifest-schema.ts
│   ├── __generated__/
│   │   └── axm-skill.schema.json
│   └── ... (moved from cli/src/skills/)
├── commands/
│   ├── manifest-schema.ts
│   └── __generated__/
│       └── axm-command.schema.json
├── mcp-servers/
│   ├── manifest-schema.ts
│   └── __generated__/
│       └── axm-mcp-server.schema.json
└── packs/
    ├── manifest-schema.ts
    └── __generated__/
        └── axm-pack.schema.json
```

**Rationale**: Groups related code. When adding a new extension type, you create one folder with everything needed.

**Alternative**: Keep flat structure. Rejected because it doesn't scale and makes relationships unclear.

### 3. Rename manifest files to manifest-schema.ts

Each extension type folder contains `manifest-schema.ts` (not `manifest-<type>.ts`).

**Rationale**: Within the skills/ folder, we know it's for skills. `manifest-schema.ts` is clear and consistent across types.

### 4. Delete schemas/ folder entirely

After moving all files, remove `cli/src/schemas/`. No barrel file needed - consumers import from domain folders.

**Rationale**: Avoids the "everything schemas" anti-pattern. Each domain owns its schemas.

### 5. Co-locate generated JSON schemas with source

Each schema that generates a JSON schema gets a `__generated__/` folder next to it:

```
lockfile/
├── schema.ts
└── __generated__/
    └── axm-lock.schema.json
settings/
├── schema.ts
└── __generated__/
    └── settings.schema.json
```

**Rationale**: Generated files belong with their source. Makes it obvious which JSON schema corresponds to which Effect schema.

**Alternative**: Single `__generated__` folder. Rejected because it doesn't match the domain-based organization.

### 6. Move generation script from core to cli

Move `packages/core/scripts/generate-schemas.ts` to `packages/cli/scripts/generate-schemas.ts`. Update imports to reference new schema locations.

**Rationale**: The schemas now live in cli package. Script should be co-located with what it generates.

## Risks / Trade-offs

**[Many import updates required]** → Straightforward find-replace. TypeScript will catch any missed imports.

**[Temporary code churn]** → Single PR, all moves atomic. No partial states.
