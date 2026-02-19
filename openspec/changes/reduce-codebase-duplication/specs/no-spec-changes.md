# No Specification Changes

This change removes dead code, unused exports, and skipped test suites. It does not alter any user-facing behavior or API contracts.

## Verification

- The `extension-resolution` spec describes `resolveSource()` which lives in `sources/resolve-source.ts` — unaffected by removing the empty `resolution/` directory
- All removed functions have zero production callers — no behavioral change
- The single-step plan builder extraction is an internal refactor within the skills feature — no observable behavior change
