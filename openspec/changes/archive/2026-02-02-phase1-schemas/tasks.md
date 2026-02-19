## 1. Setup

- [x] 1.1 Create `packages/core/src/schemas/` directory structure
- [x] 1.2 Create `packages/core/src/schemas/index.ts` barrel export
- [x] 1.3 Verify @effect/schema is available (add dependency if needed)

## 2. Common Schemas

- [x] 2.1 Create `common.ts` with Author schema
- [x] 2.2 Add CommonManifestFields (name, version, description, keywords, repository, homepage, license, bugs, author)
- [x] 2.3 Add FullyQualifiedName schema with `@<namespace>/<name>` pattern validation
- [x] 2.4 Add ExtensionType, SourceType, and AgentId literal unions
- [x] 2.5 Add tests for common schemas

## 3. Manifest Schemas

- [x] 3.1 Create `manifest-skill.ts` with SkillManifest schema
- [x] 3.2 Create `manifest-command.ts` with CommandManifest schema
- [x] 3.3 Create `manifest-pack.ts` with PackManifest schema (includes extension reference arrays)
- [x] 3.4 Create `manifest-mcp-server.ts` with McpServerManifest schema
- [x] 3.5 Add tests for all manifest schemas

## 4. Settings Schema

- [x] 4.1 Create `settings.ts` with Settings schema
- [x] 4.2 Add SourceConfig schema (github, gitlab, bitbucket, azuredevops, git, registry)
- [x] 4.3 Add AgentId literal union and agents array schema
- [x] 4.4 Add ExtensionsConfig schema (skills, commands, packs, mcp-servers maps)
- [x] 4.5 Add tests for settings schema

## 5. Lockfile Schema

- [x] 5.1 Create `lockfile.ts` with Lockfile schema
- [x] 5.2 Add LockEntry schema with all required/optional fields
- [x] 5.3 Add ExtensionsByType schema (skills, commands, packs, mcp-servers maps)
- [x] 5.4 Add tests for lockfile schema

## 6. JSON Schema Generation

- [x] 6.1 Create `packages/core/src/schemas/__generated__/` directory
- [x] 6.2 Create generation script at `packages/core/scripts/generate-schemas.ts`
- [x] 6.3 Add `pnpm generate:schemas` command to package.json
- [x] 6.4 Generate and commit all 6 JSON schema files
- [x] 6.5 Add CI check to verify generated schemas are up to date
