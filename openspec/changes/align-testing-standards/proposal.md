# Change: Align Testing Standards

## Why

The codebase has comprehensive testing guidelines spread across CLAUDE.md and 5 testing skills, but current tests have inconsistencies. Core package tests use `__tests__/` directories instead of colocation, helper naming varies, and some error paths lack coverage.

## What Changes

- Move 9 core package tests from `__tests__/` to colocated files
- Standardize Effect testing helpers to `run`/`runEither` pattern
- Add missing error path tests for exported error types
- Update test names to use behavioral descriptions
- Add test colocation requirement to core spec

## Impact

- **File moves**: 9 test files change location (imports update accordingly)
- **Spec change**: Core testability requirement gains colocation and Effect pattern scenarios
- **No behavior changes**: Tests themselves function identically; only organization and naming improve
