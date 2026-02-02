## 1. Update Documentation

- [x] 1.1 Update proposal.md lockfile section (§3.5) to use YAML format and `axm-lock.yaml` filename
- [x] 1.2 Update proposal.md example lockfile content from JSON to YAML syntax

## 2. Update Specs

- [x] 2.1 Update openspec/specs/schema-lockfile/spec.md to reference YAML format and `axm-lock.yaml`

## 3. Update Schema Code

- [x] 3.1 Update lockfile.ts JSDoc comment from "axm-lock.json" to "axm-lock.yaml"
- [x] 3.2 Update lockfile.test.ts to use YAML parsing in test scenarios
- [x] 3.3 Run typecheck and tests, fix any issues
- [x] 3.4 Kill any runaway vitest worker processes

## 4. Update Generated Schema

- [x] 4.1 Regenerate JSON schema (filename remains axm-lock.schema.json as it describes the data structure)
- [x] 4.2 Run typecheck and tests, fix any issues
- [x] 4.3 Kill any runaway vitest worker processes
