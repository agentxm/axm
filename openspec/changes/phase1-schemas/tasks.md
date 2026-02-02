## 1. Setup

- [ ] 1.1 Create `packages/core/src/schemas/` directory structure
- [ ] 1.2 Create `packages/core/src/schemas/index.ts` barrel export
- [ ] 1.3 Verify @effect/schema is available (add dependency if needed)

## 2. Common Schemas

- [ ] 2.1 Create `common.ts` with Author schema
- [ ] 2.2 Add CommonManifestFields (name, version, description, keywords, repository, homepage, license, bugs, author)
- [ ] 2.3 Add FullyQualifiedName schema with `@<scope>/<name>` pattern validation
- [ ] 2.4 Add ExtensionType and SourceType literal unions
- [ ] 2.5 Add tests for common schemas

## 3. Manifest Schemas

- [ ] 3.1 Create `manifest-skill.ts` with SkillManifest schema
- [ ] 3.2 Create `manifest-command.ts` with CommandManifest schema
- [ ] 3.3 Create `manifest-pack.ts` with PackManifest schema (includes extension reference arrays)
- [ ] 3.4 Create `manifest-mcp-server.ts` with McpServerManifest schema
- [ ] 3.5 Add tests for all manifest schemas

## 4. Settings Schema

- [ ] 4.1 Create `settings.ts` with Settings schema
- [ ] 4.2 Add SourceConfig schema (github, gitlab, bitbucket, azuredevops, git, registry)
- [ ] 4.3 Add AgentConfig schema (claude-code, cursor, windsurf, codex, copilot, gemini, vscode, opencode)
- [ ] 4.4 Add ExtensionsConfig schema (skills, commands, packs, mcp-servers maps)
- [ ] 4.5 Add tests for settings schema

## 5. Lockfile Schema

- [ ] 5.1 Create `lockfile.ts` with Lockfile schema
- [ ] 5.2 Add LockEntry schema with all required/optional fields
- [ ] 5.3 Add ExtensionsByType schema (skills, commands, packs, mcp-servers maps)
- [ ] 5.4 Add tests for lockfile schema

## 6. JSON Schema Generation

- [ ] 6.1 Create `packages/core/src/schemas/__generated__/` directory
- [ ] 6.2 Create generation script at `packages/core/scripts/generate-schemas.ts`
- [ ] 6.3 Add `pnpm generate:schemas` command to package.json
- [ ] 6.4 Generate and commit all 6 JSON schema files
- [ ] 6.5 Add CI check to verify generated schemas are up to date
