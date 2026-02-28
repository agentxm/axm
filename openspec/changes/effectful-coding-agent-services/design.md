## Context

Skill installation currently relies on hard-coded agent descriptors and assumes a mostly uniform skills path convention. That assumption breaks for agents that support configurable skill directories rather than a fixed `.agents/skills` location. The install operation needs an extensible way to resolve each agent's effective destination and avoid duplicate work when multiple agents map to the same directory.

Constraints:

- Scope is limited to skills install behavior.
- Backward compatibility is not a goal for internal interfaces.
- Changes must keep lint and tests green.
- Existing coding agent modules/folders should be reused rather than replaced.

## Goals / Non-Goals

**Goals:**

- Introduce a `CodingAgent` Effect service contract for skills install concerns.
- Resolve effective skills directory per configured agent via service implementations.
- De-duplicate destination directories before install side effects.
- Keep per-directory symlink/copy fallback behavior deterministic and observable.

**Non-Goals:**

- Migrating MCP server or command operations to `CodingAgent`.
- Redesigning registry resolution, lockfile schema, or workspace settings model.
- Generalizing all agent behaviors in one change.

## Decisions

1. Introduce a dedicated `CodingAgent` service boundary

- Decision: Add a domain/service abstraction that exposes agent-specific skills installation helpers (for example, resolving effective skills directory for a workspace + agent).
- Rationale: Centralizes agent variance behind Effect services and removes branching from install orchestration.
- Alternative considered: Keep hard-coded descriptor branching in install flow. Rejected because it scales poorly as agent support grows.

1b. Reuse existing coding agent module layout

- Decision: Implement `CodingAgent` adapters within existing agent modules/folders and compose them via layers, instead of introducing a parallel folder taxonomy.
- Rationale: Minimizes churn, preserves discoverability, and allows incremental migration from descriptor-based behavior.
- Alternative considered: Create a brand-new agent implementation tree. Rejected because it duplicates concepts and increases migration overhead.

2. Resolve effective directories per agent, then operate on distinct directories

- Decision: `skills-install-execute` collects configured agents, resolves each effective directory through `CodingAgent`, partitions tagged outcomes (`supported`, `unsupported`, `disabled`, `misconfigured`), then normalizes and de-duplicates supported directories before materialization/symlink steps.
- Rationale: Prevents duplicate writes/symlinks when multiple agents share a target directory.
- Alternative considered: Execute install independently per agent. Rejected due to redundant I/O and non-deterministic conflict behavior.

3. Preserve install result reporting semantics while adding directory-level execution

- Decision: Keep user-visible success/failure model aligned with current install results, but compute outcomes from directory-level operations mapped back to agents.
- Rationale: Limits behavior churn while enabling distinct-directory optimization.
- Alternative considered: Switch entirely to directory-centric user output. Rejected for now to avoid broader CLI UX changes.

4. Wire agent implementations as layers

- Decision: Provide `CodingAgent` implementations through Effect layers and inject into skills install handlers.
- Rationale: Matches existing architecture and keeps implementations testable/mocked at handler boundaries.
- Alternative considered: Direct imports of agent-specific modules. Rejected due to tighter coupling and weaker composability.

5. Expose repository-style orchestration for configured agent resolution

- Decision: Introduce `CodingAgentRepository` that encapsulates configured-agent lookup (`getConfiguredAgents`) while keeping directory resolution explicit in handlers via per-agent `resolveEffectiveSkillsDir` calls.
- Rationale: Reduces handler boilerplate and keeps agent/workspace orchestration logic in one reusable service.
- Alternative considered: Keep handlers responsible for calling workspace then per-agent registry methods. Rejected as repetitive and error-prone.

6. Replace ambiguous `Option.none()` with explicit resolution outcomes

- Decision: Replace `Option<Option<string>>` semantics with an explicit tagged outcome (`supported`, `unsupported`, `disabled`, `misconfigured`) so install flow can skip only safe cases and fail with actionable errors for invalid configuration.
- Rationale: `None` currently conflates unsupported vs unconfigured/misconfigured and hides important user-facing behavior.
- Alternative considered: Keep `Option.none()` and rely on logs. Rejected due weak observability and ambiguous UX.

7. Add strict vs best-effort policy for unknown configured agents

- Decision: Default to best-effort (skip unknown configured agents with warning), with a strict mode that fails the command for CI/policy enforcement.
- Rationale: Preserves usability while enabling deterministic enforcement.
- Alternative considered: Always fail-fast. Rejected because one stale configured agent would block all installs.

8. Define path source-of-truth precedence explicitly

- Decision: Effective skills directory precedence is: explicit runtime override (agent/user config/env/flags) -> validated docs mapping for that agent -> descriptor fallback.
- Rationale: Makes behavior predictable during descriptor/doc drift.
- Alternative considered: descriptor-only precedence. Rejected because several agents have changed conventions recently.

## Pseudocode

```ts
// agents/coding-agent.ts
import { Context, Effect, Option } from "effect";
import type { AgentId } from "@/agents";

export interface ResolveSkillsDirArgs {
  readonly workspaceRoot: string;
}

export interface CodingAgent {
  readonly id: AgentId;
  readonly resolveEffectiveSkillsDir: (
    args: ResolveSkillsDirArgs,
  ) => Effect.Effect<ResolveSkillsDirOutcome, CliError>;
}

export type ResolveSkillsDirOutcome =
  | { readonly _tag: "supported"; readonly dir: string }
  | { readonly _tag: "unsupported" }
  | { readonly _tag: "disabled"; readonly reason: string }
  | { readonly _tag: "misconfigured"; readonly reason: string };

export class CodingAgentRepository extends Context.Tag("CodingAgentRepository")<
  CodingAgentRepository,
  {
    readonly get: (id: AgentId) => Effect.Effect<CodingAgent, CliError>;
    readonly all: Effect.Effect<ReadonlyArray<CodingAgent>, never>;
    readonly getConfiguredAgents: () => Effect.Effect<ReadonlyArray<CodingAgent>, CliError>;
  }
>() {}
```

```ts
// agents/claude-code/service.ts
import { Context, Effect, Layer, Option } from "effect";

export class ClaudeCodeAgent extends Context.Tag("ClaudeCodeAgent")<
  ClaudeCodeAgent,
  CodingAgent
>() {}

export const ClaudeCodeAgentLive = Layer.effect(
  ClaudeCodeAgent,
  Effect.succeed({
    id: "claude-code",
    resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
      Effect.gen(function* () {
        const settings = yield* ClaudeSettingsService;
        const path = yield* Path.Path;
        const configured = yield* settings.getSkillsDir(workspaceRoot);
        const dir = Option.getOrElse(configured, () => ".agents/skills");
        return {
          _tag: "supported",
          dir: path.resolve(workspaceRoot, dir),
        } as const;
      }),
  } satisfies CodingAgent),
);
```

```ts
// agents/gemini/service.ts
import { Context, Effect, Layer, Option } from "effect";

export class GeminiAgent extends Context.Tag("GeminiAgent")<GeminiAgent, CodingAgent>() {}

export const GeminiAgentLive = Layer.effect(
  GeminiAgent,
  Effect.succeed({
    id: "gemini-cli",
    resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
      Effect.gen(function* () {
        const config = yield* GeminiConfigService;
        const path = yield* Path.Path;
        const supportsSkillsInstall = yield* config.supportsWorkspaceSkillsInstall(workspaceRoot);
        if (!supportsSkillsInstall) {
          return { _tag: "unsupported" } as const;
        }
        const configured = yield* config.getSkillsDir(workspaceRoot);
        const dir = Option.getOrElse(configured, () => ".agents/skills");
        return {
          _tag: "supported",
          dir: path.resolve(workspaceRoot, dir),
        } as const;
      }),
  } satisfies CodingAgent),
);
```

```ts
// agents/repository/layer.ts
export const CodingAgentRepositoryLive = Layer.effect(
  CodingAgentRepository,
  Effect.gen(function* () {
    const workspace = yield* Workspace;
    const claude = yield* ClaudeCodeAgent;
    const gemini = yield* GeminiAgent;
    const byId = { "claude-code": claude, "gemini-cli": gemini } as const;

    return {
      get: (id: AgentId) =>
        id in byId
          ? Effect.succeed(byId[id])
          : makeCliError({
              code: "CODING_AGENT_NOT_SUPPORTED",
              what: `Unsupported coding agent: ${id}`,
            }),
      all: Effect.succeed(Object.values(byId)),
      getConfiguredAgents: () =>
        Effect.gen(function* () {
          const ids = yield* workspace.getConfiguredAgents();
          return yield* Effect.forEach(
            ids,
            (id) =>
              Effect.gen(function* () {
                const agent = yield* id in byId
                  ? Effect.succeed(byId[id])
                  : makeCliError({
                      code: "CODING_AGENT_NOT_SUPPORTED",
                      what: `Unsupported coding agent: ${id}`,
                    });
                return agent;
              }),
            { concurrency: "unbounded" },
          );
        }),
    };
  }),
);
```

```ts
// skills-install-execute/operation.ts
const installSkill = (args: InstallSkillArgs) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const repository = yield* CodingAgentRepository;

    // 1) Resolve configured agents from repository
    const configuredAgents = yield* repository.getConfiguredAgents();

    // 2) Map configured agents -> effective skills directories
    const resolved = yield* Effect.forEach(
      configuredAgents,
      (agent) =>
        agent.resolveEffectiveSkillsDir({ workspaceRoot: args.workspaceRoot }).pipe(
          Effect.map((outcome) => ({
            agentId: agent.id,
            outcome,
          })),
        ),
      { concurrency: "unbounded" },
    );

    // 2a) Partition outcomes
    const supported = Array.filterMap(resolved, ({ agentId, outcome }) =>
      outcome._tag === "supported"
        ? Option.some({ agentId, dir: path.normalize(outcome.dir) })
        : Option.none(),
    );
    const misconfigured = Array.filter(resolved, ({ outcome }) => outcome._tag === "misconfigured");
    const unknownAgents = yield* collectUnknownConfiguredAgents();

    // 2b) Policy gate
    if (misconfigured.length > 0) {
      return yield* makeCliError({
        code: "SKILL_DIR_MISCONFIGURED",
        what: "One or more configured agents have invalid skills directory settings",
      });
    }
    if (args.strict && unknownAgents.length > 0) {
      return yield* makeCliError({
        code: "CODING_AGENT_UNKNOWN_CONFIGURED",
        what: "Unknown configured agents found in strict mode",
      });
    }
    yield* logWarningsForSkippedAgents({ resolved, unknownAgents });

    // best-effort: continue with supported agents only
    const installable = supported;

    // 3) De-duplicate target directories (multiple agents may share one dir)
    const distinctDirs = Array.dedupe(installable.map((x) => x.dir));

    // 4) Materialize/symlink once per distinct directory
    const perDirResults = yield* Effect.forEach(
      distinctDirs,
      (dir) =>
        materializeAndSymlinkToDir({
          skillSrcPath: args.skillSrcPath,
          dir,
          skillName: args.skillName,
        }),
      { concurrency: "unbounded" },
    );

    // 5) Project directory outcomes back to per-agent outcomes
    const perAgentResults = mapDirectoryResultsToAgents({
      resolved: installable,
      perDirResults,
    });

    // 6) Reuse existing lockfile/settings/result finalization semantics
    return yield* finalizeSkillInstall({
      args,
      perAgentResults,
    });
  });
```

## Mode Notes

The matrix "Configurable dir?" column reflects CLI/install behavior. Some ecosystems (notably OpenHands SDK) are programmatic and can load arbitrary skill directories even when CLI discovery roots are fixed.

| Agent module | CLI configurable dir? | SDK/programmatic configurable dir? | Notes                                                                                                              |
| ------------ | --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `openhands`  | `no`                  | `yes`                              | CLI/overview docs use fixed roots and deprecate `.openhands`; SDK docs allow explicit `load_skills_from_dir(...)`. |

## Artifact Completion Gate

- Before implementation, create `specs` and `tasks` artifacts for this change.
- `specs` must encode: outcome taxonomy (`supported`/`unsupported`/`disabled`/`misconfigured`), strict vs best-effort policy, source-of-truth precedence, and reporting behavior.
- `tasks` must include tests for all scenarios in the matrix below.

## Test Matrix

- Shared directory dedupe across 2+ agents mapping to one path.
- Unsupported agent (`unsupported`) is skipped and reported.
- Disabled agent (`disabled`) is skipped and reported distinctly.
- Misconfigured agent (`misconfigured`) fails with actionable error.
- Unknown configured agent: warning in best-effort, failure in strict mode.
- Override precedence: runtime override beats docs mapping beats descriptor fallback.
- Mixed outcome install run: partial support with deterministic per-agent results.
- Path normalization edge cases (relative vs absolute, symlinked parent dirs).
- Partial per-directory failure maps correctly to all affected agents.

## Agent Module Matrix

Resolution contract for all rows:

- Support check: `resolveEffectiveSkillsDir(...)` returns tagged outcomes (`supported` / `unsupported` / `disabled` / `misconfigured`).
- Directory resolution: when `supported`, return an effective directory from runtime override first, then validated docs mapping, then descriptor fallback.

| Agent module     | Descriptor dir        | Settings docs                                                                      | Configurable dir? (evidence)                                                                | Strategy for support + dir                                                                           | Special considerations vs `.agents/skills`                               |
| ---------------- | --------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `adal`           | `.adal/skills`        | https://docs.sylph.ai/features/plugins-and-skills                                  | `no` - docs list fixed sources/precedence, no custom path setting documented                | Use documented fixed locations; return `unsupported`/`disabled` when roots are unavailable by policy | Non-universal path                                                       |
| `amp`            | `.agents/skills`      | https://ampcode.com/manual#agent-skills                                            | `yes` - docs expose `amp.skills.path` for additional skills directories                     | Read configured `amp.skills.path`, then fallback defaults                                            | Supports universal dir plus explicit config override                     |
| `antigravity`    | `.agent/skills`       | https://antigravity.google/docs/skills                                             | `no` - docs define fixed workspace/global roots with no configurable override field         | Use documented fixed roots (`.agent/skills`, `~/.gemini/antigravity/skills`)                         | Uses `.agent/skills` (singular)                                          |
| `augment`        | `.augment/rules`      | https://docs.augmentcode.com/cli/skills                                            | `no` - docs describe fixed discovery paths, no custom path config documented                | Use documented fixed paths/precedence                                                                | Docs describe `.augment/skills`; module descriptor may lag               |
| `claude-code`    | `.claude/skills`      | https://code.claude.com/docs/en/skills                                             | `yes` - docs allow additional dirs via `--add-dir`                                          | Honor explicit add-dir sources when present, else default roots                                      | Non-universal path                                                       |
| `cline`          | `.cline/skills`       | https://docs.cline.bot/features/skills                                             | `no` - docs describe fixed discovery roots/precedence                                       | Use documented fixed roots                                                                           | Non-universal path                                                       |
| `codebuddy`      | `.codebuddy/skills`   | https://www.codebuddy.ai/docs/ide/Features/Skills                                  | `no` - docs specify `.codebuddy/skills` location, no custom path knob documented            | Use workspace/global standard locations                                                              | Non-universal path                                                       |
| `codex`          | `.codex/skills`       | https://developers.openai.com/codex/skills                                         | `no` - docs enumerate fixed scopes/roots                                                    | Use fixed scope order; do not expect custom path setting                                             | Includes `.agents/skills` scopes not `.codex/skills` roots               |
| `command-code`   | `.commandcode/skills` | https://commandcode.ai/docs/skills                                                 | `no` - docs define fixed project/global locations                                           | Use fixed project/global locations                                                                   | Non-universal path                                                       |
| `continue`       | `.continue/skills`    | https://docs.continue.dev/customize/rules                                          | `unknown` - provided doc is rules-focused and does not establish skills-dir behavior        | Keep as unknown until skills docs/config source is added                                             | Rules-first docs; verify skills support separately                       |
| `crush`          | `.crush/skills`       | https://github.com/charmbracelet/crush?tab=readme-ov-file#agent-skills             | `yes` - docs expose `CRUSH_SKILLS_DIR` and `options.skills_paths`                           | Read env/config overrides first, then platform defaults                                              | Supports explicit custom skill paths                                     |
| `cursor`         | `.cursor/skills`      | https://cursor.com/docs/context/skills                                             | `no` - docs list fixed auto-loaded locations, no custom path setting documented             | Use documented auto-load path set                                                                    | Recently expanded multi-root compatibility                               |
| `droid`          | `.factory/skills`     | https://docs.factory.ai/cli/configuration/skills                                   | `no` - docs show fixed discovery locations                                                  | Use documented `.factory` roots                                                                      | Uses `.factory/skills`                                                   |
| `gemini-cli`     | `.gemini/skills`      | https://geminicli.com/docs/cli/skills/                                             | `no` - docs describe fixed workspace/user/extension tiers                                   | Use tiered fixed discovery order                                                                     | Supports `.gemini/skills` and `.agents/skills` compatibility             |
| `github-copilot` | `.github/skills`      | https://docs.github.com/en/copilot/concepts/agents/about-agent-skills              | `no` - docs define fixed supported locations, no custom path knob documented                | Use supported fixed directories                                                                      | Uses `.github/skills` and `.claude/skills`                               |
| `goose`          | `.goose/skills`       | https://block.github.io/goose/docs/guides/context-engineering/using-skills/        | `no` - docs provide explicit ordered directory list                                         | Use documented ordered roots                                                                         | Multi-root compatibility list                                            |
| `iflow-cli`      | `.iflow/skills`       | https://platform.iflow.cn/en/cli/examples/skill                                    | `no` - docs show fixed global/project paths                                                 | Use fixed global/project dirs                                                                        | Non-universal path                                                       |
| `junie`          | `.junie/skills`       | https://junie.jetbrains.com/docs/agent-skills.html                                 | `yes` - docs support `JUNIE_HOME` changing user-level skills location                       | Resolve from `JUNIE_HOME` when set, else defaults                                                    | Explicit env-based path override                                         |
| `kilo`           | `.kilocode/skills`    | https://kilo.ai/docs/customize/skills                                              | `no` - docs describe fixed global/project discovery                                         | Use fixed global/project dirs                                                                        | Uses `.kilocode/skills`                                                  |
| `kimi-cli`       | `.agents/skills`      | https://moonshotai.github.io/kimi-cli/en/customization/skills.html                 | `yes` - docs support `--skills-dir` override                                                | Respect explicit CLI override first, then standard discovery                                         | Universal default with explicit flag override                            |
| `kiro-cli`       | `.kiro/skills`        | https://kiro.dev/docs/cli/custom-agents/configuration-reference/#skill-resources   | `yes` - docs allow configurable skill resources in custom-agent config                      | Read configured skill resources; fallback to default convention                                      | Requires resource registration semantics                                 |
| `kode`           | `.kode/skills`        | https://github.com/shareAI-lab/kode/blob/main/docs/skills.md                       | `no` - docs show fixed locations/workflows, no custom path setting documented               | Use fixed project/global conventions                                                                 | Non-universal path                                                       |
| `mistral-vibe`   | `.vibe/skills`        | https://github.com/mistralai/mistral-vibe#skills-system                            | `yes` - docs expose `skill_paths` in config                                                 | Read `skill_paths` first, then standard discovery roots                                              | Explicit custom path list                                                |
| `mux`            | `.mux/skills`         | https://mux.coder.com/agents/agent-skills                                          | `no` - docs define fixed roots/precedence only                                              | Use fixed root precedence                                                                            | Also reads universal `~/.agents/skills`                                  |
| `neovate`        | `.neovate/skills`     | https://neovateai.dev/en/docs/skills                                               | `yes` - docs expose configurable `skills` entries in settings                               | Read configured skill paths list, then defaults                                                      | Explicit custom path list                                                |
| `openclaw`       | `skills`              | https://docs.openclaw.ai/tools/skills                                              | `yes` - docs support `skills.load.extraDirs`                                                | Read `skills.load.extraDirs` + defaults                                                              | Bare `skills/` workspace root plus configurable extras                   |
| `opencode`       | `.opencode/skills`    | https://opencode.ai/docs/skills                                                    | `no` - docs describe fixed searched paths/walk-up behavior                                  | Use fixed searched paths                                                                             | Includes compatibility directories                                       |
| `openhands`      | `.openhands/skills`   | https://docs.openhands.dev/sdk/guides/skill                                        | `yes` - SDK supports explicit directory loading (`load_skills_from_dir("/path/to/skills")`) | For SDK mode, honor configured/programmatic path; for CLI, use fixed roots                           | Descriptor path may be legacy (`.openhands` deprecated in overview docs) |
| `pi`             | `.pi/skills`          | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md | `yes` - docs support custom `skills` setting and `--skill` CLI path                         | Merge explicit configured/CLI paths with defaults                                                    | Supports explicit custom skill file/dir inputs                           |
| `pochi`          | `.pochi/skills`       | https://docs.getpochi.com/skills/                                                  | `no` - docs show fixed project/global locations                                             | Use fixed project/global dirs                                                                        | Non-universal path                                                       |
| `qoder`          | `.qoder/skills`       | https://docs.qoder.com/cli/Skills                                                  | `no` - docs show fixed personal/project paths and precedence                                | Use fixed personal/project precedence                                                                | Non-universal path                                                       |
| `qwen-code`      | `.qwen/skills`        | https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/                  | `no` - docs show fixed user/project + extension skills sources                              | Use fixed source precedence                                                                          | Non-universal path                                                       |
| `replit`         | `.agents/skills`      | https://docs.replit.com/replitai/skills                                            | `no` - docs describe scope behavior but no custom path config                               | Use standard `.agents/skills` conventions                                                            | Universal path with product-level scope controls                         |
| `roo`            | `.roo/skills`         | https://docs.roocode.com/features/skills                                           | `no` - docs specify fixed project/global and mode-specific roots                            | Use fixed discovery matrix                                                                           | Supports both `.roo` and `.agents` conventions                           |
| `trae`           | `.trae/skills`        | https://docs.trae.ai/ide/skills                                                    | `unknown` - page content not retrievable in current environment                             | Keep unknown until docs are fetched/verified                                                         | Non-universal path                                                       |
| `trae-cn`        | `.trae/skills`        | https://docs.trae.ai/ide/skills                                                    | `unknown` - same unresolved source as Trae                                                  | Keep unknown until docs are fetched/verified                                                         | Shares Trae directory convention                                         |
| `windsurf`       | `.windsurf/skills`    | https://docs.windsurf.com/windsurf/cascade/skills                                  | `no` - docs define fixed workspace/global locations only                                    | Use documented fixed locations                                                                       | Non-universal path                                                       |
| `zencoder`       | `.zencoder/skills`    | https://docs.zencoder.ai/features/skills                                           | `no` - docs define fixed auto-discovery locations                                           | Use documented fixed auto-discovery roots                                                            | Also reads `.claude/skills`                                              |

Notes:

- Validation pass completed against linked docs on 2026-02-27.
- Remaining `unknown` entries are unresolved due unreachable/incomplete source docs in this environment; treat as conservative default.
- Install flow policy: `unsupported` / `disabled` are skippable (with reporting), `misconfigured` fails with actionable error, unknown configured agents follow strict vs best-effort mode.

## Risks / Trade-offs

- [Path normalization mismatches produce false non-distinct entries] -> Mitigation: normalize resolved paths through platform path service before de-duplication and add targeted tests.
- [Agent-to-directory result mapping becomes harder to reason about] -> Mitigation: keep explicit mapping structure and unit-test multi-agent/shared-directory scenarios.
- [Partial failures across shared directories affect multiple agents] -> Mitigation: surface clear per-agent derived result details from a single directory operation outcome.

## Migration Plan

1. Add `coding-agent-services` capability and define service contract.
2. Implement initial agent adapters for currently supported agents.
3. Update `skills-install-execute` to resolve -> dedupe -> install/symlink.
4. Add/adjust tests for shared-directory and agent-specific path scenarios.
5. Run lint/test/typecheck before merge.

## Anticipated File Inventory

The following inventory is the expected implementation footprint for this change (validated against current code layout).

| Status     | Path                                                              | Anticipated change                                                                                                                                      |
| ---------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Add**    | `packages/cli/src/agents/coding-agent.ts`                         | Define shared `CodingAgent` contract, tagged resolution outcomes, and repository service tag.                                                           |
| **Add**    | `packages/cli/src/agents/coding-agent.test.ts`                    | Unit tests for outcome taxonomy and precedence behavior.                                                                                                |
| **Add**    | `packages/cli/src/agents/repository.ts`                           | Implement `CodingAgentRepositoryLive` (configured agents + unknown configured ids).                                                                     |
| **Add**    | `packages/cli/src/agents/repository.test.ts`                      | Tests for repository resolution, unknown-id surfacing, and strict/best-effort policy inputs.                                                            |
| **Add**    | `packages/cli/src/agents/claude-code/service.ts`                  | Claude Code service implementation for effective skills-dir resolution.                                                                                 |
| **Add**    | `packages/cli/src/agents/gemini-cli/service.ts`                   | Gemini CLI service implementation for tagged outcome resolution.                                                                                        |
| **Change** | `packages/cli/src/agents/claude-code/index.ts`                    | Export Claude service alongside descriptor exports.                                                                                                     |
| **Change** | `packages/cli/src/agents/gemini-cli/index.ts`                     | Export Gemini service alongside descriptor exports.                                                                                                     |
| **Change** | `packages/cli/src/agents/index.ts`                                | Export new coding-agent service/repository APIs.                                                                                                        |
| **Change** | `packages/cli/src/extensions/skills/manager.ts`                   | Primary install path refactor: resolve via repository, partition outcomes, dedupe distinct directories, map per-directory results to per-agent results. |
| **Change** | `packages/cli/src/extensions/skills/manager.test.ts`              | Add coverage for tagged outcomes, distinct-directory dedupe, strict/best-effort unknown-agent behavior.                                                 |
| **Change** | `packages/cli/src/extensions/skills/operations/install.ts`        | Keep parity for direct operation callers (`packs unpack`, `skills fork`, `skills update`) with same repository/outcome semantics.                       |
| **Change** | `packages/cli/src/extensions/skills/operations/install.test.ts`   | Regression tests for operation parity with manager behavior.                                                                                            |
| **Change** | `packages/cli/src/cli-commands/skills/install/command-actions.ts` | Thread strict/best-effort policy inputs into built install operations (if policy is operation-arg driven).                                              |
| **Change** | `packages/cli/src/workspace/test-stubs.ts`                        | Extend stubs to satisfy new repository/service dependencies in tests.                                                                                   |
| **Remove** | _None planned_                                                    | No removals required for this scoped change.                                                                                                            |

Rollback: revert handler wiring to descriptor-based path resolution and remove service integration points from the change.

## Open Questions

- Should effective skills directory resolution return both raw and normalized paths for diagnostics?
- Should lockfile metadata eventually capture resolved directory snapshots for troubleshooting?
