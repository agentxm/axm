## 1. Schema Updates

- [x] 1.1 Update SourceSchema in extension-sources.ts to add "local" literal
- [x] 1.2 Verify typecheck passes
- [x] 1.3 Fix any linting errors

## 2. Types Updates

- [x] 2.1 Update ParsedSource in types.ts to include localPath field for local sources
- [x] 2.2 Verify typecheck passes
- [x] 2.3 Fix any linting errors

## 3. Source Parser

- [x] 3.1 Update source-parser.test.ts with tests for local path recognition (./path, /path, ~/path, Windows paths)
- [x] 3.2 Update source-parser.ts to recognize local paths instead of rejecting them
- [x] 3.3 Verify typecheck passes
- [x] 3.4 Run source-parser tests and fix failures
- [x] 3.5 Fix any linting errors
- [x] 3.6 Kill vitest worker processes

## 4. Local Path Resolver

- [x] 4.1 Restore local-path.test.ts from git history
- [x] 4.2 Update local-path.test.ts to include ~/path scenarios
- [x] 4.3 Restore local-path.ts from git history
- [x] 4.4 Update local-path.ts to support ~ home directory expansion
- [x] 4.5 Export local-path resolver from resolvers/index.ts
- [x] 4.6 Verify typecheck passes
- [x] 4.7 Run local-path tests and fix failures
- [x] 4.8 Fix any linting errors
- [x] 4.9 Kill vitest worker processes

## 5. Ambiguous Resolver Integration

- [x] 5.1 Update ambiguous.test.ts with tests for local path precedence
- [x] 5.2 Update ambiguous.ts to try local path first before GitHub shorthand
- [x] 5.3 Verify typecheck passes
- [x] 5.4 Run ambiguous tests and fix failures
- [x] 5.5 Fix any linting errors
- [x] 5.6 Kill vitest worker processes

## 6. Resolution Pipeline Integration

- [x] 6.1 Update resolver.test.ts with local path resolution tests
- [x] 6.2 Update resolver.ts to include local-path resolver in pipeline
- [x] 6.3 Verify typecheck passes
- [x] 6.4 Run resolver tests and fix failures
- [x] 6.5 Fix any linting errors
- [x] 6.6 Kill vitest worker processes

## 7. Full Test Suite Verification

- [x] 7.1 Run full test suite for core package
- [x] 7.2 Fix any remaining test failures
- [x] 7.3 Run typecheck for entire project
- [x] 7.4 Run linting for entire project
- [x] 7.5 Kill vitest worker processes
