# Implementation Tasks

## 1. Resolution Module Setup

- [x] 1.1 Create `packages/core/src/experimental/resolution/` directory structure
- [x] 1.2 Create `types.ts` with `ExtensionRef`, `ExtensionType`, `SourceType`, `ResolutionOptions`, `ExtensionMetadata`
- [x] 1.3 Create `errors.ts` with `ResolutionError` tagged error class
- [x] 1.4 Create `index.ts` barrel export

## 2. Individual Resolvers

- [x] 2.1 Implement `resolvers/local-path.ts` - detect and resolve `./`, `../`, `/`, Windows paths
- [x] 2.2 Implement `resolvers/axm-name.ts` - resolve `@scope/name` via project → global → registry
- [x] 2.3 Implement `resolvers/bare-name.ts` - resolve bare names using implied scope from settings
- [x] 2.4 Implement `resolvers/explicit-source.ts` - resolve `github:`, `gitlab:` prefixed inputs (wrap existing source-parser)
- [x] 2.5 Implement `resolvers/ambiguous.ts` - disambiguate `a/b` patterns (local → AXM → sources)
- [x] 2.6 Implement `resolvers/url.ts` - resolve unmatched URLs

## 3. Resolution Pipeline

- [x] 3.1 Implement `resolver.ts` with ordered pipeline using Effect.gen
- [x] 3.2 Add type filtering (only return matching `types` option)
- [x] 3.3 Add source filtering (only query specified `sources` option)
- [x] 3.4 Wire up `resolveExtension()` public API in `index.ts`

## 4. Resolution Module Tests

- [x] 4.1 Unit tests for `local-path.ts` resolver
- [x] 4.2 Unit tests for `axm-name.ts` resolver
- [x] 4.3 Unit tests for `bare-name.ts` resolver
- [x] 4.4 Unit tests for `explicit-source.ts` resolver
- [x] 4.5 Unit tests for `ambiguous.ts` resolver
- [x] 4.6 Unit tests for `url.ts` resolver
- [x] 4.7 Integration tests for full resolution pipeline

## 5. Schema Updates

- [x] 5.1 Update `types.ts` in skills module - new `Settings` interface with `extensions.skills`
- [x] 5.2 Update `types.ts` in skills module - new `Lockfile` interface with `lockfileVersion`, `extensions`, `folderHash`
- [x] 5.3 Update `settings.ts` - read/write new settings format
- [x] 5.4 Update `lockfile.ts` - read/write JSON format with new schema
- [x] 5.5 Add `folderHash` computation (git tree SHA or content hash fallback)

## 6. Schema Tests

- [x] 6.1 Update `settings.test.ts` for new schema
- [x] 6.2 Update `lockfile.test.ts` for JSON format and new fields

## 7. CLI Handler Updates

- [x] 7.1 Update `handler.ts` to import and use `resolveExtension()`
- [x] 7.2 Add conflict detection logic (check if skill exists, warn and skip)
- [x] 7.3 Add `--force` flag handling to overwrite existing skills
- [x] 7.4 Update lockfile writes to use new schema
- [ ] 7.5 Update settings writes to use new schema
- [ ] 7.6 Handle resolution returning multiple results (prompt for selection)
- [ ] 7.7 Handle resolution returning empty results (display error with suggestions)

## 8. CLI Tests

- [ ] 8.1 Update `handler.test.ts` for resolution module integration
- [ ] 8.2 Add tests for conflict detection (skip by default)
- [ ] 8.3 Add tests for `--force` flag behavior
- [ ] 8.4 Update tests for new settings/lockfile schemas
- [ ] 8.5 Add tests for AXM name input patterns
- [ ] 8.6 Add tests for explicit source prefix patterns

## 9. E2E Tests

- [ ] 9.1 Update E2E tests for new lockfile JSON format
- [ ] 9.2 Update E2E tests for new settings structure
- [ ] 9.3 Add E2E test for conflict detection behavior

## 10. Cleanup

- [ ] 10.1 Remove YAML lockfile parsing code (or keep for migration warning)
- [ ] 10.2 Update experimental index exports to include resolution module
- [ ] 10.3 Add JSDoc with `@experimental` tags to all new exports
