# Dry-Run Capability Analysis: Install Skill

## Executive Summary

This document analyzes how to implement dry-run functionality for the `axm skills install` command. Dry-run support enables faster smoke testing, safer CI/CD integration, and better user confidence before committing to changes.

---

## Current Install Capability Overview

### Flow (8 Steps)

1. **Parse Source** - Resolve `github:owner/repo`, local path, or well-known URL
2. **Ensure Initialized** - Create `.axm/` directory if missing
3. **Detect/Select Agents** - Find installed agents (Claude Code, Cursor, etc.)
4. **Discover Skills** - Clone/fetch source, find SKILL.md files
5. **List Mode** - If `--list`, display skills and exit (already read-only)
6. **Select Skills** - Interactive or via `--skill`/`--all` flags
7. **Conflict Detection** - Check lockfile for existing installations
8. **Install & Update** - Copy files, create symlinks, update metadata

### Side Effects (What Dry-Run Must Intercept)

| Operation        | Target                  | Description                                |
| ---------------- | ----------------------- | ------------------------------------------ |
| Git clone        | `.axm/cache/git/`       | Clone repos for GitHub/GitLab sources      |
| HTTP fetch       | `.axm/cache/wellknown/` | Download skill files from well-known URLs  |
| Directory copy   | `.axm/skills/{name}/`   | Copy skill to canonical location           |
| Symlink create   | `{agent}/skills/{name}` | Link skill to each agent                   |
| File write       | `.axm/settings.json`    | Update skill version specifiers            |
| File write       | `.axm/axm-lock.yaml`    | Update lockfile with installation metadata |
| Directory create | `.axm/`                 | Initialize axm directory structure         |

### Key Architecture Traits

- **Effect-based**: All operations are Effects that don't execute until interpreted
- **Service-driven**: Uses `FileSystem`, `HttpClient`, `Path` services from Effect platform
- **Layered**: Services provided at the edge via `NodeContext.layer`
- **Parallel**: Agent installations run concurrently; metadata updates are sequential

---

## Why Dry-Run Matters

1. **Fast Smoke Testing** - Verify install logic without file system changes
2. **CI/CD Safety** - Test installation in pipelines without side effects
3. **User Confidence** - Show exactly what will happen before committing
4. **Debugging** - Trace installation flow without cleanup burden
5. **Idempotency Checks** - Verify what would change on re-run
6. **Remote Validation** - For registry operations like `publish`/`unpublish`, dry-run validates that operations would succeed (auth, permissions, version conflicts) before committing

---

## Architecture: Operation Log + Replay

Separate planning from execution: generate a list of operations, then optionally execute. This is the Terraform-style "plan/apply" model.

**Anti-pattern this approach avoids:**

The most common dry-run bug is the "two codepaths" problem where dry-run logic diverges from execution:

```typescript
// ❌ Anti-pattern: separate code paths that can diverge
if (dryRun) {
  console.log(`Would copy: ${src}`); // Different code path
} else {
  await copyDir(src, dest); // Only this path is tested
}
```

As features evolve, these branches diverge and previews become misleading. The operation log pattern avoids this by design—the same `planInstall()` code runs regardless of mode, and the plan is the single source of truth.

---

#### Core Insight: Three Categories of Operations

Analyzing the current install handler reveals three distinct categories:

| Category       | Operations                                                    | Side Effects                  | Dry-Run Behavior              |
| -------------- | ------------------------------------------------------------- | ----------------------------- | ----------------------------- |
| **Always-Run** | Init wizard (if needed), user prompts, pre-condition checks   | None (user interaction only)  | Run normally                  |
| **Discovery**  | Parse source, detect agents, discover skills                  | Git clone, HTTP fetch (cache) | Run normally (populate cache) |
| **Mutation**   | Copy files, create symlinks, update lockfile, update settings | File system writes            | Skip (plan only)              |

The key insight: **Not all logic needs dry-run treatment.** The dry-run boundary applies only to mutations:

```
┌─────────────────────────────────────────┐
│  ALWAYS RUNS (even in dry-run)          │
│  - Parse source                         │
│  - Run init wizard if workspace missing │
│  - Detect/select agents (prompts)       │
│  - Discover skills                      │
│  - Select skills (prompts)              │
│  - Check conflicts                      │
│  - Build plan                           │
├─────────────────────────────────────────┤
│  SKIPPED IN DRY-RUN (mutations only)    │
│  - Copy skill files                     │
│  - Create symlinks                      │
│  - Update lockfile                      │
│  - Update settings                      │
└─────────────────────────────────────────┘
```

Interactive wizards and prompts are part of **gathering information to build the plan**, not part of execution. A dry-run validates that all preconditions can be satisfied and shows exactly what mutations would occur.

---

#### Operation Type Definitions

```typescript
// packages/core/src/experimental/operations/types.ts

import { Data } from "effect";

// =============================================================================
// Discovery Operations (may have cache side effects)
// =============================================================================

export type DiscoveryOp = Data.TaggedEnum<{
  /** Clone a git repository to cache */
  CloneRepo: { url: string; dest: string; ref?: string };
  /** Fetch well-known index from URL */
  FetchWellKnownIndex: { baseUrl: string };
  /** Fetch skill files from well-known source */
  FetchSkillFiles: { baseUrl: string; skillName: string; dest: string };
  /** Discover SKILL.md files in directory */
  DiscoverSkills: { path: string };
}>;

export const DiscoveryOp = Data.taggedEnum<DiscoveryOp>();

// =============================================================================
// Mutation Operations (pure side effects on local state)
// =============================================================================

export type MutationOp = Data.TaggedEnum<{
  /** Create directory structure */
  CreateDir: { path: string; recursive: boolean };
  /** Copy directory contents */
  CopyDir: { src: string; dest: string };
  /** Create symbolic link */
  CreateSymlink: { target: string; link: string };
  /** Copy file or directory (symlink fallback) */
  CopyFallback: { src: string; dest: string };
  /** Write file contents */
  WriteFile: { path: string; content: string };
  /** Update lockfile entry */
  UpdateLockEntry: {
    axmDir: string;
    skillName: string;
    entry: {
      source: string;
      origin?: string;
      folderHash: string;
      installedAt: string;
      updatedAt: string;
    };
  };
  /** Update settings.json */
  UpdateSettings: {
    axmDir: string;
    patch: { skills?: Record<string, string> };
  };
  /** Remove file or directory */
  Remove: { path: string; recursive: boolean };
}>;

export const MutationOp = Data.taggedEnum<MutationOp>();

// =============================================================================
// Install Plan
// =============================================================================

export interface SkillInstallPlan {
  /** Skill being installed */
  skill: {
    name: string;
    path: string;
    description?: string;
  };
  /** Where skill will be copied (canonical location) */
  canonicalPath: string;
  /** Agent installations */
  agentInstalls: Array<{
    agentId: string;
    agentName: string;
    targetPath: string;
    method: "symlink" | "copy";
  }>;
  /** Content hash for lockfile */
  contentHash: string;
  /** Lock entry to write */
  lockEntry: {
    source: string;
    origin?: string;
    folderHash: string;
    installedAt: string;
    updatedAt: string;
  };
}

export interface InstallPlan {
  /** Source information */
  source: {
    type: "local" | "github" | "gitlab" | "well-known";
    canonical: string;
    origin?: string;
  };
  /** Discovery operations (may populate cache) */
  discovery: DiscoveryOp[];
  /** Skills to install */
  skills: SkillInstallPlan[];
  /** Flat list of mutation operations (derived from skills) */
  mutations: MutationOp[];
  /** Summary statistics */
  summary: {
    skillCount: number;
    agentCount: number;
    symlinkCount: number;
    copyCount: number;
    newSkills: string[];
    updatedSkills: string[];
    skippedSkills: string[];
  };
}
```

---

#### Planning Phase

The planning phase gathers information and builds an `InstallPlan` without executing mutations.

```typescript
// packages/core/src/experimental/operations/planner.ts

import { Effect, pipe } from "effect";
import type { FileSystem, HttpClient } from "@effect/platform";
import type { InstallArgs } from "../skills/types.js";
import type { InstallPlan, SkillInstallPlan, MutationOp } from "./types.js";

/**
 * Plans an install operation without executing mutations.
 *
 * Discovery operations (git clone, HTTP fetch) still execute to gather
 * accurate information. Use `planInstallFromCache` for fully offline planning.
 */
export const planInstall = (
  args: InstallArgs,
): Effect.Effect<
  InstallPlan,
  PlanError,
  FileSystem.FileSystem | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const axmDir = getAxmDir(args.global);

    // Step 1: Parse source (pure, no side effects)
    const parsed = yield* parseSource(args.source);

    // Step 2: Ensure initialized exists OR plan to create
    const initNeeded = yield* checkNeedsInit(axmDir);

    // Step 3: Detect agents (reads filesystem, no mutations)
    const agents = yield* resolveAgents(args);

    // Step 4: Discover skills (may clone/fetch - this is the key decision point)
    const { skills, discoveryOps, commitSha } = yield* discoverWithTracking(
      parsed,
      axmDir,
    );

    // Step 5: Select skills (may prompt, no side effects)
    const selectedSkills = yield* selectSkills(args, skills);

    // Step 6: Check conflicts against existing lockfile
    const { newSkills, updatedSkills, skippedSkills } = yield* checkConflicts(
      axmDir,
      selectedSkills,
      args.force,
    );

    // Step 7: Build per-skill installation plans (Effect.forEach for effectful mapping)
    const now = new Date().toISOString();
    const skillsToInstall = [...newSkills, ...updatedSkills];

    const skillPlans = yield* Effect.forEach(
      skillsToInstall,
      (skill) =>
        Effect.gen(function* () {
          const canonicalPath = nodePath.join(axmDir, "skills", skill.name);

          // These operations may be effectful (file system reads for hash, etc.)
          const [agentInstalls, contentHash] = yield* Effect.all([
            planAgentInstalls(skill, agents, axmDir, canonicalPath),
            computeContentHash(skill.path),
          ]);

          return {
            skill: {
              name: skill.name,
              path: skill.path,
              description: skill.description,
            },
            canonicalPath,
            agentInstalls,
            contentHash,
            lockEntry: {
              source: parsed.canonical,
              origin: getOriginFromParsed(parsed),
              folderHash: contentHash,
              installedAt: now,
              updatedAt: now,
            },
          } satisfies SkillInstallPlan;
        }),
      { concurrency: "unbounded" }, // Skills can be planned in parallel
    );

    // Step 8: Derive flat mutation list from skill plans
    const mutations = deriveMutations(skillPlans, axmDir, initNeeded);

    return {
      source: {
        type: parsed.type,
        canonical: parsed.canonical,
        origin: getOriginFromParsed(parsed),
      },
      discovery: discoveryOps,
      skills: skillPlans,
      mutations,
      summary: {
        skillCount: skillPlans.length,
        agentCount: agents.length,
        symlinkCount: skillPlans
          .flatMap((p) => p.agentInstalls)
          .filter((i) => i.method === "symlink").length,
        copyCount: skillPlans
          .flatMap((p) => p.agentInstalls)
          .filter((i) => i.method === "copy").length,
        newSkills: newSkills.map((s) => s.name),
        updatedSkills: updatedSkills.map((s) => s.name),
        skippedSkills: skippedSkills.map((s) => s.name),
      },
    };
  });

/**
 * Derives the flat list of mutations from skill plans.
 * Pure function - no side effects, no mutation.
 */
const deriveMutations = (
  skillPlans: SkillInstallPlan[],
  axmDir: string,
  initNeeded: boolean,
): MutationOp[] => [
  // Init operations (conditional spread)
  ...(initNeeded
    ? [
        MutationOp.CreateDir({ path: axmDir, recursive: true }),
        MutationOp.CreateDir({
          path: nodePath.join(axmDir, "skills"),
          recursive: true,
        }),
        MutationOp.CreateDir({
          path: nodePath.join(axmDir, "cache"),
          recursive: true,
        }),
        MutationOp.WriteFile({
          path: nodePath.join(axmDir, "settings.json"),
          content: JSON.stringify({ agents: [], skills: {} }, null, 2),
        }),
      ]
    : []),

  // Per-skill operations (flatMap for declarative transformation)
  ...skillPlans.flatMap((plan) => [
    // Copy to canonical location
    MutationOp.CopyDir({
      src: plan.skill.path,
      dest: plan.canonicalPath,
    }),

    // Agent installations (map with conditional)
    ...plan.agentInstalls.map((agent) =>
      agent.method === "symlink"
        ? MutationOp.CreateSymlink({
            target: plan.canonicalPath,
            link: agent.targetPath,
          })
        : MutationOp.CopyFallback({
            src: plan.canonicalPath,
            dest: agent.targetPath,
          }),
    ),

    // Metadata updates
    MutationOp.UpdateLockEntry({
      axmDir,
      skillName: plan.skill.name,
      entry: plan.lockEntry,
    }),
    MutationOp.UpdateSettings({
      axmDir,
      patch: { skills: { [plan.skill.name]: "*" } },
    }),
  ]),
];
```

---

#### Execution Phase

The executor takes a plan and applies its mutations using Effect's declarative combinators.

```typescript
// packages/core/src/experimental/operations/executor.ts

import { Effect, pipe, Schedule } from "effect";
import type { FileSystem, Path } from "@effect/platform";
import type { InstallPlan, MutationOp } from "./types.js";

/**
 * Default retry policy for transient failures (e.g., file system busy).
 */
const retryPolicy = pipe(
  Schedule.exponential("100 millis"),
  Schedule.intersect(Schedule.recurs(2)),
);

/**
 * Executes the mutations from an install plan.
 * Uses Effect.forEach for declarative iteration with built-in error handling.
 */
export const executePlan = (
  plan: InstallPlan,
): Effect.Effect<
  ExecutionResult,
  ExecutionError,
  FileSystem.FileSystem | Path.Path
> =>
  pipe(
    Effect.forEach(
      plan.mutations,
      (op) =>
        pipe(
          executeMutation(op),
          Effect.retry(retryPolicy),
          Effect.tapError((e) =>
            Effect.logError(`Mutation failed: ${describeMutation(op)}`, e),
          ),
        ),
      { concurrency: 1 }, // Sequential execution (order matters)
    ),
    Effect.map((results) => ({
      success: true,
      mutationsApplied: results.length,
      results,
    })),
  );

/**
 * Executes a single mutation operation.
 * Returns MutationResult on success, typed error on failure.
 */
const executeMutation = (
  op: MutationOp,
): Effect.Effect<
  MutationResult,
  ExecutionError,
  FileSystem.FileSystem | Path.Path
> =>
  pipe(
    MutationOp.$match(op, {
      CreateDir: ({ path, recursive }) => fs.makeDirectory(path, { recursive }),
      CopyDir: ({ src, dest }) => copyDirectory(src, dest),
      CreateSymlink: ({ target, link }) => fs.symlink(target, link),
      CopyFallback: ({ src, dest }) => copyDirectory(src, dest),
      WriteFile: ({ path, content }) => fs.writeFileString(path, content),
      UpdateLockEntry: ({ axmDir, skillName, entry }) =>
        updateLockEntry(axmDir, skillName, entry),
      UpdateSettings: ({ axmDir, patch }) => updateSettings(axmDir, patch),
      Remove: ({ path, recursive }) => fs.remove(path, { recursive }),
    }),
    Effect.map(() => ({ op, success: true as const })),
    Effect.mapError((cause) => new ExecutionError({ op, cause })),
  );
```

**Benefits of this approach:**

- **Declarative**: `Effect.forEach` replaces imperative loop + mutable accumulator
- **Retry built-in**: Transient failures (file busy, network blip) auto-retry
- **Error logging**: Failures logged with context before propagating
- **Concurrency control**: Easy to parallelize independent operations later
- **Type-safe errors**: `ExecutionError` wraps the failing operation for debugging

---

#### Refactored Handler

```typescript
// packages/cli/src/commands/skills/install/handler.ts

export const handleInstall = (
  args: InstallArgs,
): Effect.Effect<
  void,
  InstallError,
  FileSystem.FileSystem | HttpClient.HttpClient | Path.Path
> =>
  Effect.gen(function* () {
    p.intro(`axm skills install (${args.global ? "global" : "project"})`);

    // Phase 1: Plan (includes all discovery, prompts, and validation)
    const spinnerHelper = createSpinnerHelper();
    spinnerHelper.start("Planning installation...");

    const plan = yield* planInstall(args).pipe(
      Effect.mapError(
        (e) =>
          new InstallError({ message: e.message, cause: e, retryable: false }),
      ),
    );

    spinnerHelper.stop(
      `Plan: ${plan.summary.skillCount} skill(s) to ${plan.summary.agentCount} agent(s)`,
    );

    // Phase 2: Display plan (SAME for dry-run and real execution)
    // --json flag outputs raw plan for CI/CD and testing
    if (args.json) {
      console.log(JSON.stringify(plan, null, 2));
    } else {
      displayPlan(plan);
    }

    // Phase 3: Dry-run exits here (only the outro differs)
    if (args.dryRun) {
      if (!args.json) {
        p.outro("Dry-run complete. No changes made.");
      }
      return;
    }

    // Phase 4: Confirm (unless --yes)
    // Confirmation requirements vary by danger level (see Danger Levels table below)
    if (!args.yes && !args.nonInteractive) {
      const confirmed = yield* promptConfirm(
        `Apply ${plan.mutations.length} operations?`,
      );
      if (!confirmed) {
        p.cancel("Installation cancelled.");
        return;
      }
    }

    // Phase 5: Execute
    spinnerHelper.start("Applying changes...");

    const result = yield* executePlan(plan).pipe(
      Effect.mapError(
        (e) =>
          new InstallError({ message: e.message, cause: e, retryable: false }),
      ),
    );

    spinnerHelper.stop(`Applied ${result.mutationsApplied} operations`);

    // Phase 6: Success outro (display already shown in Phase 2)
    p.outro(`Successfully installed ${plan.summary.skillCount} skill(s)`);
  });
```

Note: The `displayPlan()` call is identical for both modes. The only difference is:

- **Dry-run**: exits after display with "No changes made"
- **Execution**: continues to confirm → execute → success outro

---

#### Unified Display Logic

**Design principle**: Preview (dry-run) and actual execution share the same display logic. The plan is the single source of truth for what to display—only the framing (header/outro) differs between modes.

```typescript
// packages/cli/src/commands/skills/install/display.ts

import type {
  InstallPlan,
  MutationOp,
} from "@agentxm/core/experimental/operations";
import * as p from "@clack/prompts";

/**
 * Display plan operations - SAME output for both dry-run and execution.
 * The plan determines what to show; the mode only affects header/outro.
 *
 * For machine-readable output, use --json flag which outputs the raw
 * InstallPlan object. Useful for CI/CD integration and testing.
 */
export const displayPlan = (plan: InstallPlan): void => {
  // Source info
  p.log.info(`Source: ${plan.source.canonical} (${plan.source.type})`);

  // Skill summary
  if (plan.summary.newSkills.length > 0) {
    p.log.info(`New skills: ${plan.summary.newSkills.join(", ")}`);
  }
  if (plan.summary.updatedSkills.length > 0) {
    p.log.info(`Updated skills: ${plan.summary.updatedSkills.join(", ")}`);
  }
  if (plan.summary.skippedSkills.length > 0) {
    p.log.warn(
      `Skipped (already installed): ${plan.summary.skippedSkills.join(", ")}`,
    );
  }

  // Operations (grouped by skill, showing functional behavior not file operations)
  for (const skillPlan of plan.skills) {
    const agentNames = skillPlan.agentInstalls.map((a) => a.agentName);
    const isNew = plan.summary.newSkills.includes(skillPlan.skill.name);
    const prefix = isNew ? "+" : "~";

    p.log.step(`${prefix} ${skillPlan.skill.name} → ${agentNames.join(", ")}`);
    if (skillPlan.skill.description) {
      p.log.message(`    ${skillPlan.skill.description}`);
    }
  }

  // Summary line (Terraform-style)
  p.log.info("");
  const parts = [];
  if (plan.summary.newSkills.length > 0) {
    parts.push(`${plan.summary.newSkills.length} to install`);
  }
  if (plan.summary.updatedSkills.length > 0) {
    parts.push(`${plan.summary.updatedSkills.length} to update`);
  }
  if (plan.summary.skippedSkills.length > 0) {
    parts.push(`${plan.summary.skippedSkills.length} unchanged`);
  }
  p.log.info(`Plan: ${parts.join(", ")}`);
};

const describeMutation = (op: MutationOp): string =>
  MutationOp.$match(op, {
    CreateDir: ({ path }) => `mkdir ${path}`,
    CopyDir: ({ src, dest }) => `copy ${src} -> ${dest}`,
    CreateSymlink: ({ target, link }) => `symlink ${link} -> ${target}`,
    CopyFallback: ({ src, dest }) => `copy ${src} -> ${dest}`,
    WriteFile: ({ path }) => `write ${path}`,
    UpdateLockEntry: ({ skillName }) => `update lockfile (${skillName})`,
    UpdateSettings: ({ patch }) =>
      `update settings (${Object.keys(patch.skills ?? {}).join(", ")})`,
    Remove: ({ path }) => `remove ${path}`,
  });
```

This ensures:

- **Consistency**: What you see in dry-run is exactly what happens in execution
- **Maintainability**: Single display function to update
- **Predictability**: No divergence between preview and reality

---

#### Handling Discovery Side Effects

The biggest challenge: **discovery operations have side effects** (git clone, HTTP fetch). Options:

**Option 1: Accept discovery side effects**

- Clone/fetch always runs (populates cache)
- Only mutations are skipped in dry-run
- Pros: Accurate planning, validates source exists
- Cons: Dry-run is not fully side-effect-free

**Option 2: Cache-first discovery**

- Check cache first; if present, use it
- Only clone/fetch if cache miss AND not dry-run
- In dry-run with cache miss: log "would clone" and fail planning

```typescript
const discoverWithTracking = (
  parsed: ParsedSource,
  axmDir: string,
  options: { dryRun: boolean },
): Effect.Effect<DiscoveryResult, DiscoveryError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const discoveryOps: DiscoveryOp[] = [];

    if (parsed.type === "github" || parsed.type === "gitlab") {
      const cacheDir = getCacheDir(parsed, axmDir);
      const cacheExists = yield* fs.exists(cacheDir);

      if (!cacheExists) {
        if (options.dryRun) {
          // Record what would happen, but don't execute
          discoveryOps.push(
            DiscoveryOp.CloneRepo({
              url: buildCloneUrl(parsed),
              dest: cacheDir,
              ref: parsed.ref,
            }),
          );
          // Return placeholder data
          return {
            skills: [],
            discoveryOps,
            warning:
              "Cannot discover skills without cloning. Run without --dry-run first.",
          };
        }

        // Not dry-run: clone and track
        discoveryOps.push(
          DiscoveryOp.CloneRepo({
            url: buildCloneUrl(parsed),
            dest: cacheDir,
            ref: parsed.ref,
          }),
        );
        yield* cloneRepo(buildCloneUrl(parsed), cacheDir, parsed.ref);
      }

      const skills = yield* discoverSkills(cacheDir);
      return { skills, discoveryOps };
    }

    // Local source: no discovery side effects
    const skills = yield* discoverSkills(parsed.canonical);
    return { skills, discoveryOps };
  });
```

**Option 3: Shallow probe (recommended for git)**

- Use `git ls-remote` to validate repo without full clone
- Parse repository structure from API (GitHub/GitLab REST API)
- Full clone only on execute

```typescript
const probeGitSource = (
  parsed: ParsedSource,
): Effect.Effect<GitProbeResult, ProbeError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    // Use GitHub/GitLab API to list files
    if (parsed.type === "github") {
      const contents = yield* fetchGitHubContents(
        parsed.owner,
        parsed.repo,
        parsed.path,
      );
      // Find SKILL.md files from API response
      return { skills: findSkillsFromContents(contents) };
    }
    // ... similar for GitLab
  });
```

**Recommendation: Hybrid approach**

1. Local sources: Always discover (no side effects)
2. Git sources with cache: Use cache
3. Git sources without cache + dry-run: Use API probe if available, warn if not
4. Well-known sources: Always fetch index (small, read-only)

---

#### Plan Serialization (Future: Terraform-style)

```typescript
// Serialize plan to JSON for persistence/review
export const serializePlan = (plan: InstallPlan): string =>
  JSON.stringify(plan, null, 2);

// Load plan from JSON
export const deserializePlan = (json: string): InstallPlan =>
  JSON.parse(json) as InstallPlan;

// Save plan to file (like `terraform plan -out=plan.json`)
export const savePlan = (
  plan: InstallPlan,
  path: string,
): Effect.Effect<void, WriteError, FileSystem.FileSystem> =>
  fs.writeFileString(path, serializePlan(plan));

// Apply saved plan (like `terraform apply plan.json`)
export const applyPlan = (
  path: string,
): Effect.Effect<
  ExecutionResult,
  ApplyError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const json = yield* fs.readFileString(path);
    const plan = deserializePlan(json);
    return yield* executePlan(plan);
  });
```

This enables workflows like:

```bash
# Generate and save plan
axm skills install github:org/skills --plan-out=install.plan

# Review plan
cat install.plan | jq '.mutations'

# Apply saved plan
axm skills apply install.plan
```

---

#### Rollback Support

Operations are reversible. Each mutation has an inverse:

```typescript
const invertMutation = (op: MutationOp): MutationOp =>
  MutationOp.$match(op, {
    CreateDir: ({ path }) => MutationOp.Remove({ path, recursive: false }),
    CopyDir: ({ dest }) => MutationOp.Remove({ path: dest, recursive: true }),
    CreateSymlink: ({ link }) =>
      MutationOp.Remove({ path: link, recursive: false }),
    CopyFallback: ({ dest }) =>
      MutationOp.Remove({ path: dest, recursive: true }),
    WriteFile: ({ path }) => MutationOp.Remove({ path, recursive: false }),
    // Metadata rollback is trickier - need to restore previous state
    UpdateLockEntry: (args) =>
      MutationOp.Remove({ path: "...", recursive: false }), // TODO
    UpdateSettings: (args) =>
      MutationOp.Remove({ path: "...", recursive: false }), // TODO
    Remove: () => {
      throw new Error("Cannot invert Remove without original content");
    },
  });

const createRollbackPlan = (plan: InstallPlan): MutationOp[] =>
  plan.mutations.map(invertMutation).reverse();
```

---

#### Migration Path

**Phase 1: Define types (non-breaking)**

- Create `packages/core/src/experimental/operations/` module
- Define `MutationOp`, `DiscoveryOp`, `InstallPlan` types
- Export from `@agentxm/core/experimental/operations`

**Phase 2: Create planner (parallel development)**

- Implement `planInstall` that mirrors current handler logic
- Write tests comparing plan output to current behavior
- Planner and current handler coexist

**Phase 3: Create executor (parallel development)**

- Implement `executePlan`
- Verify executor produces same results as current handler

**Phase 4: Add dry-run flag (feature flag)**

- Add `--dry-run` flag that uses planner + display
- Real execution still uses old handler
- Users can opt-in to test

**Phase 5: Switch execution (breaking internally)**

- Handler calls `planInstall` + `executePlan`
- Old implementation code removed
- Tests updated

**Phase 6: Extend to other commands**

- `uninstall`, `update`, `sync` get same pattern
- Shared operation types, specialized planners

---

#### Pros (Expanded)

- **Crystal clear what will happen** - Operations are data, not side effects
- **Plan can be displayed, serialized, diffed, or replayed**
- **Natural undo/rollback support** - Reverse operation log
- **Perfect for UI** - Show plan, get confirmation, execute
- **Enables "apply plan" functionality** - Like Terraform
- **Testable in isolation** - Test planner separately from executor
- **Composable** - Combine plans from multiple sources
- **Auditable** - Log exactly what was done, when

#### Cons (Expanded)

- **Significant refactor** - Touches most of handler code
- **Two representations** - Plan types mirror execution types
- **Discovery coupling** - Some discovery has side effects (addressed above)
- **More complex for simple cases** - Overhead for trivial operations
- **State synchronization** - Plan may become stale if state changes

---

## Implementation Roadmap

See the detailed **Migration Path** section above. Summary:

| Phase                       | Scope                                          | Breaking?     |
| --------------------------- | ---------------------------------------------- | ------------- |
| 1. Define types             | New module, no changes to handler              | No            |
| 2. Create planner           | Parallel implementation, tests compare outputs | No            |
| 3. Create executor          | Parallel implementation                        | No            |
| 4. Add --dry-run            | Uses planner + display, old handler still runs | No            |
| 5. Switch execution         | Handler uses plan + execute                    | Internal only |
| 6. Extend to other commands | Pattern replication                            | Per-command   |

### Estimated Scope

| Component        | Files            | Complexity  |
| ---------------- | ---------------- | ----------- |
| Operation types  | 1 new            | Low         |
| Planner          | 1 new            | Medium-High |
| Executor         | 1 new            | Medium      |
| Display helpers  | 1 new            | Low         |
| Handler refactor | 1 modified       | Medium      |
| Tests            | 2-3 new/modified | Medium      |

---

### Effect Integration

The operation log pattern aligns well with Effect's philosophy:

**Operations as Data**

```typescript
// Operations are values, not effects
const op = MutationOp.CopyDir({ src: "/a", dest: "/b" });

// Execution is separate
const execute = (op: MutationOp): Effect.Effect<void, Error, FileSystem> =>
  MutationOp.$match(op, {
    /* ... */
  });
```

**Batching and Concurrency**

```typescript
// Plan enables smart execution strategies - all declarative
const executePlanOptimized = (plan: InstallPlan) =>
  pipe(
    // Partition operations by independence
    Effect.succeed(partition(plan.mutations, isCopyOp)),
    Effect.flatMap(([copyOps, metadataOps]) =>
      pipe(
        // Copies are independent - parallelize
        Effect.forEach(copyOps, executeMutation, { concurrency: "unbounded" }),
        // Then metadata updates - sequential
        Effect.flatMap(() =>
          Effect.forEach(metadataOps, executeMutation, { concurrency: 1 }),
        ),
      ),
    ),
    Effect.map((results) => ({
      success: true,
      mutationsApplied: results.length,
      results,
    })),
  );
```

**Layers for Testing**

```typescript
// Test planner with mock filesystem - pure pipe composition
const testPlanner = pipe(
  planInstall(args),
  Effect.provide(MockFileSystem),
  Effect.provide(MockHttpClient),
);

// Test executor with in-memory filesystem
const testExecutor = (plan: InstallPlan) =>
  pipe(executePlan(plan), Effect.provide(InMemoryFileSystem));

// Run in tests
const plan = await Effect.runPromise(testPlanner);
const result = await Effect.runPromise(testExecutor(plan));
```

### Prompts and User Interaction

All interactive flows happen during planning—execution is non-interactive:

```
┌─────────────────────────────────────────────────────┐
│              PLANNING PHASE (always runs)            │
│  - Parse source                                      │
│  - Run init wizard if workspace not initialized      │
│  - Detect agents                                     │
│  - Discover skills (may clone/fetch to cache)        │
│  - SELECT SKILLS (interactive prompt)                │
│  - SELECT AGENTS (interactive prompt)                │
│  - Check conflicts                                   │
│  - Generate plan                                     │
├─────────────────────────────────────────────────────┤
│              DISPLAY PLAN (same for both modes)      │
│  - Show skills, agents, operations                   │
│  - Show summary stats                                │
├─────────────────────────────────────────────────────┤
│              DRY-RUN EXITS HERE                      │
│  - "Dry-run complete. No changes made."              │
├─────────────────────────────────────────────────────┤
│              CONFIRM (unless --yes)                  │
│  - "Apply N operations?"                             │
├─────────────────────────────────────────────────────┤
│              EXECUTION PHASE (no prompts)            │
│  - Apply mutations                                   │
│  - "Successfully installed N skill(s)"               │
└─────────────────────────────────────────────────────┘
```

**Key principle**: Wizards and prompts are part of gathering information to build the plan. They always run, even in dry-run mode. The dry-run boundary is specifically at the mutation phase.

This means:

- Init wizard runs in dry-run (validates workspace can be set up)
- Skill selection prompts run in dry-run (user chooses what to install)
- Agent selection prompts run in dry-run (user chooses target agents)
- Only the final mutations are skipped

---

### Danger Levels and Confirmation

Confirmation requirements should vary based on the destructiveness of the operation:

| Level        | Operations                       | Behavior                                           |
| ------------ | -------------------------------- | -------------------------------------------------- |
| **Low**      | list, validate, sync (read-only) | Execute immediately, no confirmation               |
| **Moderate** | install, update                  | Show preview, prompt `Proceed? [y/N]`              |
| **High**     | uninstall, force overwrite       | Show preview with warnings, prompt with default No |
| **Severe**   | uninstall with dependents        | Require typing skill name to confirm               |

**Standard flags for scripting:**

- `--yes` / `-y`: Auto-accept confirmation prompts
- `--force` / `-f`: Skip confirmation AND override safety checks (e.g., install over existing)
- `--dry-run` / `-n`: Preview only, never prompt or execute

---

## Testing Strategy

### Unit Tests: Planner

```typescript
describe("planInstall", () => {
  it("generates correct mutations for local source", async () => {
    const plan = await Effect.runPromise(
      planInstall({
        source: "./fixtures/skills",
        global: false,
        agent: ["claude-code"],
        skill: [],
        all: true,
        yes: true,
        // ...
      }).pipe(Effect.provide(TestLayer)),
    );

    expect(plan.skills).toHaveLength(2);
    expect(plan.summary.skillCount).toBe(2);
    expect(plan.mutations).toContainEqual(
      expect.objectContaining({
        _tag: "CopyDir",
        dest: expect.stringContaining(".axm/skills/commit"),
      }),
    );
    expect(plan.mutations).toContainEqual(
      expect.objectContaining({
        _tag: "CreateSymlink",
      }),
    );
  });

  it("detects conflicts with existing skills", async () => {
    // Pre-populate lockfile with existing skill
    const plan = await Effect.runPromise(
      planInstall({ source: "./fixtures/skills" /* ... */ }).pipe(
        Effect.provide(TestLayerWithExistingSkills),
      ),
    );

    expect(plan.summary.skippedSkills).toContain("commit");
    expect(plan.summary.newSkills).not.toContain("commit");
  });

  it("includes conflicts when force=true", async () => {
    const plan = await Effect.runPromise(
      planInstall({ source: "./fixtures/skills", force: true /* ... */ }).pipe(
        Effect.provide(TestLayerWithExistingSkills),
      ),
    );

    expect(plan.summary.updatedSkills).toContain("commit");
  });
});
```

### Unit Tests: Executor

```typescript
describe("executePlan", () => {
  it("applies all mutations in order", async () => {
    const plan: InstallPlan = {
      mutations: [
        MutationOp.CreateDir({ path: "/tmp/test/.axm", recursive: true }),
        MutationOp.CopyDir({
          src: "/fixtures/skill",
          dest: "/tmp/test/.axm/skills/test",
        }),
        MutationOp.CreateSymlink({
          target: "/tmp/test/.axm/skills/test",
          link: "/agent/skills/test",
        }),
      ],
      // ...
    };

    const result = await Effect.runPromise(
      executePlan(plan).pipe(Effect.provide(TestFileSystemLayer)),
    );

    expect(result.mutationsApplied).toBe(3);
    expect(await fs.exists("/tmp/test/.axm/skills/test")).toBe(true);
  });

  it("stops on first error", async () => {
    const plan: InstallPlan = {
      mutations: [
        MutationOp.CopyDir({ src: "/nonexistent", dest: "/dest" }), // Will fail
        MutationOp.CreateDir({ path: "/should-not-run", recursive: true }),
      ],
      // ...
    };

    const result = await Effect.runPromise(
      executePlan(plan).pipe(
        Effect.either,
        Effect.provide(TestFileSystemLayer),
      ),
    );

    expect(result._tag).toBe("Left");
    expect(await fs.exists("/should-not-run")).toBe(false);
  });
});
```

### Unit Tests: Operation Types

```typescript
describe("MutationOp", () => {
  it("can serialize and deserialize", () => {
    const op = MutationOp.CopyDir({ src: "/a", dest: "/b" });
    const json = JSON.stringify(op);
    const parsed = JSON.parse(json);

    expect(parsed._tag).toBe("CopyDir");
    expect(parsed.src).toBe("/a");
  });

  it("supports pattern matching", () => {
    const op = MutationOp.CreateSymlink({ target: "/a", link: "/b" });
    const description = MutationOp.$match(op, {
      CreateSymlink: ({ target, link }) => `link ${link} -> ${target}`,
      _: () => "other",
    });

    expect(description).toBe("link /b -> /a");
  });
});
```

### Integration Tests

```typescript
describe("axm skills install --dry-run", () => {
  it("shows plan without making changes", async () => {
    const result = await runCLI([
      "skills",
      "install",
      "./fixtures/skills",
      "--dry-run",
      "--all",
      "--yes",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Dry-run complete");
    expect(result.stdout).toContain("Plan: 2 to install");
    expect(result.stdout).toMatch(/\+ \w+ → /); // "+ skill-name → agent-name" format

    // Verify no actual changes
    expect(await fs.exists(".axm/skills/commit")).toBe(false);
    expect(await fs.exists(".axm/axm-lock.yaml")).toBe(false);
  });

  it("validates source exists in dry-run", async () => {
    const result = await runCLI([
      "skills",
      "install",
      "./nonexistent",
      "--dry-run",
      "--all",
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("not found");
  });

  it("dry-run with --json returns structured plan", async () => {
    const result = await runCLI([
      "skills",
      "install",
      "./fixtures/skills",
      "--dry-run",
      "--all",
      "--yes",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    const plan = JSON.parse(result.stdout);

    expect(plan.summary.skillCount).toBe(2);
    expect(plan.skills).toHaveLength(2);
    expect(plan.mutations).toContainEqual(
      expect.objectContaining({ _tag: "CopyDir" }),
    );
  });

  it("dry-run then real install produces same result", async () => {
    // Dry run with JSON for reliable parsing
    const dryResult = await runCLI([
      "skills",
      "install",
      "./fixtures/skills",
      "--dry-run",
      "--all",
      "--yes",
      "--json",
    ]);

    const plan = JSON.parse(dryResult.stdout);
    const plannedSkills = plan.skills.map((s: any) => s.skill.name);

    // Real install
    const realResult = await runCLI([
      "skills",
      "install",
      "./fixtures/skills",
      "--all",
      "--yes",
    ]);

    // Verify same skills installed
    const installedSkills = await getInstalledSkills(".axm");
    expect(installedSkills).toEqual(plannedSkills);
  });
});
```

### Snapshot Tests

```typescript
describe("plan snapshots", () => {
  it("plan output is stable for same input", async () => {
    const plan = await Effect.runPromise(
      planInstall({
        source: "./fixtures/skills",
        all: true,
        // Use deterministic timestamp
      }).pipe(Effect.provide(TestLayerWithFixedTime)),
    );

    // Snapshot the plan structure (excluding volatile fields)
    const snapshot = {
      source: plan.source,
      skillNames: plan.skills.map((s) => s.skill.name).sort(),
      mutationTypes: plan.mutations.map((m) => m._tag),
    };

    expect(snapshot).toMatchSnapshot();
  });
});
```

---

## Extension to Other Commands

The operation log pattern should extend to all mutating commands:

### Command Coverage

| Command            | Mutations                         | Priority   |
| ------------------ | --------------------------------- | ---------- |
| `skills install`   | copy, symlink, lockfile, settings | P0 (first) |
| `skills uninstall` | remove, lockfile, settings        | P1         |
| `skills update`    | remove, copy, symlink, lockfile   | P1         |
| `init`             | create dirs, write config files   | P2         |
| `skills sync`      | copy, remove, lockfile            | P2         |
| `skills publish`   | registry upload                   | P2         |
| `skills unpublish` | registry removal                  | P2         |

**Note on registry operations**: `publish` and `unpublish` benefit significantly from dry-run to validate authentication, permissions, and version constraints before committing changes to a remote registry.

### Shared Operation Types

Operations can be shared across commands:

```typescript
// Shared across all commands
type CoreMutation =
  | MutationOp.CreateDir
  | MutationOp.Remove
  | MutationOp.WriteFile
  | MutationOp.CopyDir;

// Skill-specific
type SkillMutation =
  | MutationOp.CreateSymlink
  | MutationOp.CopyFallback
  | MutationOp.UpdateLockEntry
  | MutationOp.UpdateSettings;

// All mutations
type Mutation = CoreMutation | SkillMutation;
```

### Unified Plan/Apply CLI Pattern

```bash
# All mutating commands support --dry-run
axm skills install github:org/repo --dry-run
axm skills uninstall commit --dry-run
axm skills update --all --dry-run

# Future: plan file support
axm skills install github:org/repo --plan-out=install.plan
axm apply install.plan

# Future: combined plan
axm plan install github:org/repo uninstall old-skill
axm apply combined.plan
```

---

## Open Questions

### Resolved

1. **Scope**: Should other commands get dry-run? → **Yes**, pattern extends to all mutating commands

### To Decide

2. **Discovery side effects**: Should dry-run allow git clone to populate cache?
   - Option A: No cache writes (pure dry-run, may fail on uncached sources)
   - Option B: Allow cache writes (accurate planning, minor side effects)
   - Option C: Use API probe for git (no clone, may have less info)
   - **Recommendation**: Option B for MVP, with clear messaging that cache may be updated

3. **Naming**: `--dry-run` vs `--plan` vs `--preview`?
   - `--dry-run` / `-n` - Most widely understood (Docker, npm, rsync); `-n` is Unix convention from `make`
   - `--plan` - Terraform convention, implies serializable output
   - `--preview` - Azure DevOps convention
   - **Recommendation**: `--dry-run` with `-n` shorthand for flag, "plan" for serialized output feature

4. **Plan file format**: JSON, YAML, or binary?
   - JSON: Universal, easy to inspect and manipulate
   - YAML: More readable, matches lockfile format
   - Binary: Smaller, tamper-evident (like Terraform)
   - **Recommendation**: JSON for transparency and tooling compatibility

5. **Plan staleness**: How to handle state changes between plan and apply?
   - Option A: Fail if state changed (safest)
   - Option B: Re-validate and warn (flexible)
   - Option C: Always re-plan on apply (simple but less useful)
   - **Recommendation**: Option A with `--force` to override

6. **Operation granularity**: How fine-grained should mutations be?
   - Fine: Every file copy is separate operation (verbose but reversible)
   - Coarse: "Install skill X" is one operation (simpler but less visibility)
   - **Recommendation**: Fine for internal model, coarse for user display

7. **Error handling during execution**: Rollback on failure?
   - Option A: Stop and leave partial state (simple)
   - Option B: Rollback completed operations (complex, safer)
   - Option C: Continue and report failures (resilient)
   - **Recommendation**: Option A for MVP, Option B as enhancement

### Future Considerations

8. **Remote apply**: Could plans be sent to a server for execution? (Not now, but architecture supports it)

9. **Plan diff**: Show difference between current plan and previous? (Nice to have)

10. **Interactive plan editing**: Let users modify plan before apply? (Complex, maybe not needed)

---

## Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                              CLI Layer                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  command.ts (yargs)                                               │  │
│  │    └─> handleInstall(args)                                        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                            Handler Layer                                │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  handler.ts                                                       │  │
│  │    1. plan = planInstall(args)     ◄── Planning Phase            │  │
│  │    2. displayPlanSummary(plan)                                    │  │
│  │    3. if (dryRun) return           ◄── Dry-run exits here        │  │
│  │    4. confirm()                                                   │  │
│  │    5. executePlan(plan)            ◄── Execution Phase           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│        Planner               │   │        Executor              │
│  ┌────────────────────────┐  │   │  ┌────────────────────────┐  │
│  │  planInstall()         │  │   │  │  executePlan()         │  │
│  │    - Parse source      │  │   │  │    - Apply mutations   │  │
│  │    - Detect agents     │  │   │  │    - Return results    │  │
│  │    - Discover skills   │  │   │  └────────────────────────┘  │
│  │    - Build plan        │  │   │                              │
│  │    - Return Plan       │  │   │  ┌────────────────────────┐  │
│  └────────────────────────┘  │   │  │  executeMutation()     │  │
│                              │   │  │    - Match on _tag     │  │
│  Output: InstallPlan         │   │  │    - Run Effect        │  │
│    - source                  │   │  └────────────────────────┘  │
│    - skills[]                │   │                              │
│    - mutations[]             │   │  Deps: FileSystem, Path     │
│    - summary                 │   └──────────────────────────────┘
└──────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Operation Types                               │
│  ┌──────────────────────┐  ┌──────────────────────────────────────┐  │
│  │  DiscoveryOp         │  │  MutationOp                          │  │
│  │    - CloneRepo       │  │    - CreateDir    - UpdateLockEntry  │  │
│  │    - FetchIndex      │  │    - CopyDir      - UpdateSettings   │  │
│  │    - FetchSkillFiles │  │    - CreateSymlink - Remove          │  │
│  │    - DiscoverSkills  │  │    - CopyFallback - WriteFile        │  │
│  └──────────────────────┘  └──────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Decision Record

| Decision               | Choice                  | Rationale                                                                              |
| ---------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| Architecture           | Operation Log           | Higher upfront cost pays off with cleaner design, natural dry-run, future capabilities |
| Code style             | FP with Effect          | Declarative, no mutable state; enables retry, parallelism, testability                 |
| Display logic          | Unified (plan-driven)   | Same display for preview and execution; only header/outro differs                      |
| Display focus          | Functional behavior     | Show "skill → agents" not file operations; details available via `--verbose`           |
| Dry-run scope          | Mutations only          | Wizards, prompts, discovery always run; only file writes are skipped                   |
| Discovery side effects | Allow cache population  | Accurate planning requires real data; cache is acceptable side effect                  |
| Flag name              | `--dry-run` / `-n`      | Industry standard (Docker, npm, rsync); `-n` is Unix convention from `make`            |
| Plan format            | JSON                    | Universal, tooling-friendly, inspectable                                               |
| JSON output            | `--json` flag           | Machine-readable output for CI/CD and testing                                          |
| Mutation granularity   | Fine-grained internally | Maximum visibility and reversibility                                                   |
| Mutation display       | Grouped by skill        | User-friendly summary                                                                  |
| Confirmation           | Danger-level based      | Low/moderate/high/severe levels determine confirmation requirements                    |
| Error handling         | Stop on first failure   | Simple, predictable; rollback as future enhancement                                    |

---

## Next Steps

1. **Create OpenSpec change** for this work
2. **Define operation types** in `packages/core/src/experimental/operations/`
3. **Implement planner** with tests comparing to current behavior
4. **Implement executor** with tests
5. **Add `--dry-run` flag** to install command
6. **Refactor handler** to use plan/execute pattern
7. **Extend to uninstall/update** commands
