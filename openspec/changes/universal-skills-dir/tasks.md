> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Constant and utility

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Add `UNIVERSAL_SKILLS_DIR` constant (value `.agents/skills`) to `packages/core/src/unstable/extensions/constants.ts`
- [x] 1.2 Add `isUniversalSkillsDir(resolvedDir: string, workspaceRoot: string): boolean` pure function to the same module — resolves both paths and compares
- [x] 1.3 Write tests for `isUniversalSkillsDir`: matching universal path returns `true`, agent-specific path returns `false`, trailing-slash normalization
- [x] 1.4 Export both from the extensions barrel (`packages/core/src/unstable/extensions/index.ts`)
- [x] 1.5 Run `pnpm nx run client-core:typecheck`, fix any errors
- [x] 1.6 Run `pnpm nx run client-core:test`, fix any failures
- [x] 1.7 Run `pnpm typecheck`, fix any errors
- [x] 1.8 Run `pnpm lint`, fix any errors
- [x] 1.9 Run `pnpm test`, fix any failures
- [x] 1.10 Run `pnpm test:e2e`, fix any failures
- [x] 1.11 Kill any vitest worker processes

## 2. Detection — filter universal-dir-only signals

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [x] 2.1 Update `detectionSegments` in `packages/core/src/unstable/agents/detection.ts` to filter out segments that equal the first path segment of `UNIVERSAL_SKILLS_DIR` (`.agents`)
- [x] 2.2 Update `detectionProbes` in `packages/core/src/unstable/lint/catalog/workspace-accessor/platform.ts` to apply the same filter (keep in lockstep with `detection.ts`)
- [x] 2.3 Write/update tests for `detection.ts`: agent with only universal dir is not detected; agent with universal dir plus commands dir is detected; agent with non-universal skills dir is detected normally; legacy `~/.<id>` detection still works for universal-dir-only agents
- [x] 2.4 Write/update tests for `platform.ts` detection probes: universal-dir-only agent excluded; agent with additional signal included
- [x] 2.5 Run `pnpm nx run client-core:typecheck`, fix any errors
- [x] 2.6 Run `pnpm nx run client-core:test`, fix any failures
- [x] 2.7 Run `pnpm typecheck`, fix any errors
- [x] 2.8 Run `pnpm lint`, fix any errors
- [x] 2.9 Run `pnpm test`, fix any failures
- [x] 2.10 Run `pnpm test:e2e`, fix any failures
- [x] 2.11 Kill any vitest worker processes

## 3. Lint rules — universal-dir awareness

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

> **Parallelization:** Tasks 3.1–3.2 and 3.3–3.4 are independent — can be launched as parallel subagents if desired.

- [x] 3.1 Update `skills-artifacts-clean.ts` stale arm: when a declared agent's resolved `skills.dir` is the universal location (use `isUniversalSkillsDir`), skip the stale-artifact finding for that agent. Dangling arm remains unchanged.
- [x] 3.2 Write/update tests for `skills-artifacts-clean.ts`: stale arm skipped for universal-dir agent; dangling arm still fires for universal dir; stale arm fires normally for agent-specific dir
- [x] 3.3 Update `skills-artifacts-correct.ts` consistency check: collapse declared agents that resolve to the universal dir into a single check target when verifying artifact presence. Use `isUniversalSkillsDir` to group agents by resolved dir.
- [x] 3.4 Write/update tests for `skills-artifacts-correct.ts`: multiple universal-dir agents satisfied by one artifact; mixed universal + agent-specific dirs produce finding only for the agent-specific agent missing the artifact
- [x] 3.5 Run `pnpm nx run client-core:typecheck`, fix any errors
- [x] 3.6 Run `pnpm nx run client-core:test`, fix any failures
- [x] 3.7 Run `pnpm typecheck`, fix any errors
- [x] 3.8 Run `pnpm lint`, fix any errors
- [x] 3.9 Run `pnpm test`, fix any failures
- [x] 3.10 Run `pnpm test:e2e`, fix any failures
- [x] 3.11 Kill any vitest worker processes

## 4. Install — explicit intent

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [x] 4.1 Update `packages/core/src/unstable/skills/operations/install.ts` to import and reference `UNIVERSAL_SKILLS_DIR` in a comment at the dedup site, making the intent explicit. No behavioral change.
- [x] 4.2 Run `pnpm nx run client-core:typecheck`, fix any errors
- [x] 4.3 Run `pnpm nx run client-core:test`, fix any failures
- [x] 4.4 Run `pnpm typecheck`, fix any errors
- [x] 4.5 Run `pnpm lint`, fix any errors
- [x] 4.6 Run `pnpm test`, fix any failures
- [x] 4.7 Run `pnpm test:e2e`, fix any failures
- [x] 4.8 Kill any vitest worker processes

## 5. Final verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 1–4

- [x] 5.1 Run `pnpm run ci` (full CI pipeline: lint, typecheck, build, test, e2e), fix any failures
- [x] 5.2 Kill any vitest worker processes
