## Why

AXM needs validated schemas for extension manifests, settings, and lockfiles. Effect schemas provide runtime validation with TypeScript type inference and enable JSON Schema generation for external tooling and documentation.

## What Changes

- Define Effect schemas for all Phase 1 data structures
- Generate JSON schemas from Effect schemas for each type
- Establish schema patterns for future extension types

## Capabilities

### New Capabilities

- `schema-manifest-skill`: Effect schema for axm-skill.json manifest files
- `schema-manifest-command`: Effect schema for axm-command.json manifest files
- `schema-manifest-pack`: Effect schema for axm-pack.json manifest files
- `schema-manifest-mcp-server`: Effect schema for axm-mcp-server.json manifest files
- `schema-settings`: Effect schema for .axm/settings.json configuration
- `schema-lockfile`: Effect schema for axm.lock provenance tracking

### Modified Capabilities

(none)

## Impact

- **Code**: New `packages/core/src/schemas/` module with Effect schema definitions
- **Build**: JSON schema generation as build step
- **Dependencies**: @effect/schema for schema definitions, JSON Schema generation
