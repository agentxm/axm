## 1. Schema Updates

- [ ] 1.1 Update SourceSchema in extension-sources.ts to add "local" literal
- [ ] 1.2 Verify typecheck passes
- [ ] 1.3 Fix any linting errors

## 2. Types Updates

- [ ] 2.1 Update ParsedSource in types.ts to include localPath field for local sources
- [ ] 2.2 Verify typecheck passes
- [ ] 2.3 Fix any linting errors

## 3. Source Parser

- [ ] 3.1 Update source-parser.test.ts with tests for local path recognition (./path, /path, ~/path, Windows paths)
- [ ] 3.2 Update source-parser.ts to recognize local paths instead of rejecting them
- [ ] 3.3 Verify typecheck passes
- [ ] 3.4 Run source-parser tests and fix failures
- [ ] 3.5 Fix any linting errors
- [ ] 3.6 Kill vitest worker processes

## 4. Local Path Resolver

- [ ] 4.1 Restore local-path.test.ts from git history
- [ ] 4.2 Update local-path.test.ts to include ~/path scenarios
- [ ] 4.3 Restore local-path.ts from git history
- [ ] 4.4 Update local-path.ts to support ~ home directory expansion
- [ ] 4.5 Export local-path resolver from resolvers/index.ts
- [ ] 4.6 Verify typecheck passes
- [ ] 4.7 Run local-path tests and fix failures
- [ ] 4.8 Fix any linting errors
- [ ] 4.9 Kill vitest worker processes

## 5. Ambiguous Resolver Integration

- [ ] 5.1 Update ambiguous.test.ts with tests for local path precedence
- [ ] 5.2 Update ambiguous.ts to try local path first before GitHub shorthand
- [ ] 5.3 Verify typecheck passes
- [ ] 5.4 Run ambiguous tests and fix failures
- [ ] 5.5 Fix any linting errors
- [ ] 5.6 Kill vitest worker processes

## 6. Resolution Pipeline Integration

- [ ] 6.1 Update resolver.test.ts with local path resolution tests
- [ ] 6.2 Update resolver.ts to include local-path resolver in pipeline
- [ ] 6.3 Verify typecheck passes
- [ ] 6.4 Run resolver tests and fix failures
- [ ] 6.5 Fix any linting errors
- [ ] 6.6 Kill vitest worker processes

## 7. Full Test Suite Verification

- [ ] 7.1 Run full test suite for core package
- [ ] 7.2 Fix any remaining test failures
- [ ] 7.3 Run typecheck for entire project
- [ ] 7.4 Run linting for entire project
- [ ] 7.5 Kill vitest worker processes
