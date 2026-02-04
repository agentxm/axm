## Context

The `SUPPORTED_AGENTS` array in `agent-detection.ts` defines where skills are installed for each AI coding agent. Current paths were chosen speculatively (e.g., `.claude/commands` for Claude Code's slash commands feature) but don't match the Agent Skills specification.

The [agentskills.io](https://agentskills.io) specification and [vercel-labs/skills](https://github.com/vercel-labs/skills) reference implementation establish the canonical patterns for skill installation.

## Goals / Non-Goals

**Goals:**

- Match vercel-labs/skills agent configurations exactly
- Support all 40+ agents from the [reference implementation](https://github.com/vercel-labs/skills/blob/main/src/agents.ts)
- Adopt the reference `AgentConfig` interface structure
- Clean up dead/legacy code:
  - Delete unused `installer.ts` (dead code, never imported)
  - Migrate CLI handlers to `workspace/apply.ts`
  - Delete legacy `skills/state/apply.ts`

**Non-Goals:**

- Migration tooling for existing installations
- Backward compatibility with old paths
- Canonical storage (`.agents/skills/`) - defer to future change

## Code Audit

The codebase has three layers of file-modification code for skills:

| Layer  | File                    | Status                                                | Action              |
| ------ | ----------------------- | ----------------------------------------------------- | ------------------- |
| OLD    | `skills/installer.ts`   | Dead code (exported but never imported)               | Delete              |
| LEGACY | `skills/state/apply.ts` | Used by CLI handlers via `applyDiff`                  | Migrate then delete |
| NEW    | `workspace/apply.ts`    | Per `docs/designs/dry-run.md`, implements `applyPlan` | Keep, enhance       |

**Evidence `installer.ts` is dead code:**

- Grep for imports shows zero production usage
- Only `installer.test.ts` imports these functions
- CLI handlers import from `skills/state/apply.ts` instead

**Functions in `installer.ts` (all superseded by `skills/state/apply.ts`):**

| Function                | Lines   | Purpose                                    | Superseded By |
| ----------------------- | ------- | ------------------------------------------ | ------------- |
| `copySkillToCanonical`  | 170-218 | Copy skill to `.axm/skills/<name>/`        | `applyAdd`    |
| `createAgentSymlink`    | 233-306 | Create symlink from agent dir to canonical | `applyAdd`    |
| `copyToAgent`           | 318-377 | Copy fallback when symlink fails           | `applyAdd`    |
| `installSkill`          | 394-427 | Orchestrate single skill install           | `applyAdd`    |
| `installSkillToAgents`  | 439-488 | Install to multiple agents concurrently    | `applyAdd`    |
| `removeSkillFromAgents` | 504-592 | Remove from multiple agents + canonical    | `applyRemove` |

**Why migrate to `workspace/apply.ts`:**

- Authoritative design per `docs/designs/dry-run.md`
- Common foundation for all extension types (skills, MCP servers, commands, packs)
- Built-in dry-run support
- Cleaner interface (`Plan` with `PlanStep[]` vs `SkillsDiff`)

**Out of scope** (tracked separately):

- Refactoring partial uninstall bypass to use `PlanStep` pattern (but path fix IS in scope - see Phase 4.2.1)
- Multi-extension generalization of `PlanStep` types

## Reference Implementation Specification

### AgentConfig Interface (from vercel-labs/skills/src/types.ts)

```typescript
interface AgentConfig {
  name: string; // Agent identifier (e.g., "claude-code")
  displayName: string; // Human-readable name (e.g., "Claude Code")
  skillsDir: string; // Project-level path, relative (e.g., ".claude/skills")
  globalSkillsDir: string | undefined; // Global path, absolute (or undefined if not supported)
  detectInstalled: () => Promise<boolean>; // Detection function
}
```

### Key Differences from Current Implementation

| Aspect              | Current (axm)             | Reference (vercel-labs/skills)   | New (axm)                                     |
| ------------------- | ------------------------- | -------------------------------- | --------------------------------------------- |
| Project skills path | `skillsDir` (optional)    | `skillsDir` (required)           | `skills.projectDir` (required)                |
| Global skills path  | Not present               | `globalSkillsDir \| undefined`   | `skills.globalDir: Option<string>`            |
| Detection           | `detectPath` string       | `detectInstalled()` in config    | `detectAgent()` separate function             |
| Storage             | `AgentConfig[]` array     | `Record<AgentType, AgentConfig>` | `Record.ReadonlyRecord<AgentId, AgentConfig>` |
| Path expansion      | Manual via `expandPath()` | Pre-expanded at init             | Pre-expanded at init                          |

### Canonical Storage (Reference Pattern)

The reference implementation uses a two-tier storage model:

1. **Canonical location**: `.agents/skills/<skill-name>/` (single source of truth)
2. **Agent locations**: Symlinks from agent-specific paths to canonical

Constants from `vercel-labs/skills/src/constants.ts`:

```typescript
export const AGENTS_DIR = ".agents";
export const SKILLS_SUBDIR = "skills";
```

**Note**: This change focuses on fixing `skillsDir` paths. Canonical storage adoption is a separate concern.

### Complete Agent Configuration Reference

Reference values from `vercel-labs/skills/src/agents.ts`, adapted to Effect idioms:

```typescript
import { Option } from "effect";
import * as path from "node:path";
import * as os from "node:os";

const home = os.homedir();
const configHome = process.env.XDG_CONFIG_HOME ?? path.join(home, ".config");
const claudeHome = process.env.CLAUDE_CONFIG_DIR ?? path.join(home, ".claude");
const codexHome = process.env.CODEX_HOME ?? path.join(home, ".codex");

/** Pure data configuration - no Effects embedded */
const AGENTS: AgentRegistry = {
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    skills: {
      projectDir: ".claude/skills",
      globalDir: Option.some(path.join(claudeHome, "skills")),
    },
  },
  cursor: {
    id: "cursor",
    name: "Cursor",
    skills: {
      projectDir: ".cursor/skills",
      globalDir: Option.some(path.join(home, ".cursor/skills")),
    },
  },
  codex: {
    id: "codex",
    name: "Codex",
    skills: {
      projectDir: ".codex/skills",
      globalDir: Option.some(path.join(codexHome, "skills")),
    },
  },
  opencode: {
    id: "opencode",
    name: "OpenCode",
    skills: {
      projectDir: ".opencode/skills",
      globalDir: Option.some(path.join(configHome, "opencode/skills")),
    },
  },
  replit: {
    id: "replit",
    name: "Replit",
    skills: {
      projectDir: ".agents/skills",
      globalDir: Option.none(), // No global support
    },
  },
};

/** Effectful detection - separate from pure config */
const detectAgent = (
  agent: AgentConfig,
): Effect.Effect<boolean, DetectionError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    switch (agent.id) {
      case "claude-code":
        return yield* fs.exists(claudeHome);
      case "cursor":
        return yield* fs.exists(path.join(home, ".cursor"));
      case "codex": {
        const [a, b] = yield* Effect.all([
          fs.exists(codexHome),
          fs.exists("/etc/codex"),
        ]);
        return a || b;
      }
      case "opencode":
        return yield* fs.exists(path.join(configHome, "opencode"));
      case "replit":
        return yield* fs.exists(".agents"); // Project-relative
      default:
        return false;
    }
  });
```

### Environment Variables

The reference uses these for dynamic paths:

- `CODEX_HOME` → defaults to `~/.codex`
- `CLAUDE_CONFIG_DIR` → defaults to `~/.claude`
- XDG Base Directory spec for `configHome` (via `xdg-basedir`)

## Decisions

### 1. Introduce AgentSkillsConfig for skills-specific configuration

**Decision**: Add a nested `skills` property to `AgentConfig` containing skills-specific paths, using Effect idioms.

```typescript
import { Effect, Option, Record } from "effect";
import { FileSystem } from "@effect/platform";

// Current (axm)
interface AgentConfig {
  id: string;
  name: string;
  detectPath: string;
  skillsDir?: string;
}

// New structure using Effect idioms
interface AgentSkillsConfig {
  /** Project-level skills directory, relative to cwd (e.g., ".claude/skills") */
  readonly projectDir: string;
  /** Global skills directory, absolute path. None if agent doesn't support global installation. */
  readonly globalDir: Option.Option<string>;
}

/** Agent identifier type for type-safe lookups (exhaustive list from vercel-labs/skills) */
type AgentId =
  | "claude-code"
  | "cursor"
  | "codex"
  | "opencode"
  | "windsurf"
  | "continue";
/* ... 40+ total */

interface AgentConfig {
  /** Unique identifier (e.g., "claude-code") */
  readonly id: AgentId;
  /** Human-readable display name (e.g., "Claude Code") */
  readonly name: string;
  /** Skills installation configuration */
  readonly skills: AgentSkillsConfig;
}

/** Agent registry as a Record for O(1) lookup */
type AgentRegistry = Record.ReadonlyRecord<AgentId, AgentConfig>;

/**
 * Detection is a separate function, not embedded in config.
 * Config is pure data; detection is effectful.
 */
const detectAgent = (
  agent: AgentConfig,
): Effect.Effect<boolean, DetectionError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    // Detection logic varies per agent - use pattern matching on agent.id
    // ...
  });
```

**Rationale**:

- `Option<string>` instead of `string | undefined` for `globalDir` (Effect idiom)
- Pure data config separated from effectful detection (functional core, imperative shell)
- `Record.ReadonlyRecord` for agent registry enables O(1) lookup and type-safe keys
- Detection as separate function keeps config serializable and testable

### 2. Separate pure config from effectful detection

**Decision**: Agent config is pure data. Detection is a separate effectful function.

**Rationale**:

- Functional core, imperative shell pattern
- Config remains serializable (useful for caching, debugging, testing)
- Detection function can be mocked/stubbed independently
- Aligns with Effect best practices: data and effects are separate concerns

### 3. Use `Option` for optional paths

**Decision**: Use `Option.Option<string>` instead of `string | undefined`.

```typescript
// Bad: nullable
globalDir: string | undefined;

// Good: Option
globalDir: Option.Option<string>;
```

**Rationale**: Effect idiom. Option provides combinators (`Option.map`, `Option.match`, `Option.getOrElse`) and explicit handling of the "no value" case.

### 4. Use `Record.ReadonlyRecord` for agent registry

**Decision**: Store agents as a Record keyed by ID, not an array.

```typescript
// Bad: array requires O(n) lookup
const SUPPORTED_AGENTS: AgentConfig[] = [...]

// Good: Record for O(1) lookup
const AGENTS: Record.ReadonlyRecord<AgentId, AgentConfig> = {...}
```

**Rationale**: Agents are frequently looked up by ID. Record provides O(1) access and type-safe keys.

### 5. All agents must have explicit `skills.projectDir`

**Decision**: No optional paths with fallback logic.

**Rationale**: Current fallback (`detectPath + "/skills"`) uses unexpanded tilde paths, causing bugs. Explicit paths eliminate this class of errors.

## Risks / Trade-offs

**[Breaking change]** → Acceptable for experimental API. Document in release notes.

**[Existing installations orphaned]** → Users must move skills manually. No migration tooling needed.

**[Reference drift]** → Periodically sync with vercel-labs/skills. Consider automation.

**[Effect vs Promise mismatch]** → Reference uses raw promises; we wrap in Effect. Minor friction when syncing.

## Feature Parity Audit (Verified)

Comparison of `skills/state/apply.ts` (legacy, 879 lines) vs `workspace/apply.ts` (new, 720 lines).

### Operations Comparison

| Operation        | Legacy (`applyDiff`)                 | New (`applyPlan`)                | Parity |
| ---------------- | ------------------------------------ | -------------------------------- | ------ |
| Install/Add      | `applyAdd` (lines 353-467)           | `installSkill` (lines 540-585)   | ✅     |
| Remove/Uninstall | `applyRemove` (lines 478-528)        | `uninstallSkill` (lines 635-667) | ✅     |
| Update           | `applyUpdate` (lines 540-560)        | `updateSkill` (lines 592-628)    | ✅     |
| Repair           | `applyChange` Repair case (line 675) | Not needed (use Install)         | ✅     |

### Feature Comparison

| Feature            | Legacy                          | New                                | Gap             |
| ------------------ | ------------------------------- | ---------------------------------- | --------------- |
| Copy to canonical  | `copyDirectory` (lines 268-338) | `copyDirectory` (lines 361-424)    | ✅ None         |
| Create symlink     | `applyAdd` (lines 443-450)      | `syncToAgents` (line 494)          | ✅ None         |
| Copy fallback      | `applyAdd` (lines 445-450)      | `syncToAgents` (lines 494-499)     | ✅ None         |
| Remove from agents | `applyRemove` (lines 490-501)   | `removeFromAgents` (lines 506-529) | ✅ None         |
| Remove canonical   | `applyRemove` (lines 504-521)   | `uninstallSkill` (lines 651-666)   | ✅ None         |
| Lockfile update    | Built-in (lines 756-878)        | Injected via `deps.updateLockfile` | ⚠️ Must provide |
| Settings update    | Built-in (lines 690-751)        | Injected via `deps.updateSettings` | ⚠️ Must provide |
| Dry-run            | Caller handles                  | Built-in `opts.dryRun`             | ✅ Improvement  |
| Progress events    | 8 event types                   | 2 statuses (simpler)               | ✅ Acceptable   |

### Agent Path Resolution

| Legacy                                                           | New                          | Impact                                                  |
| ---------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------- |
| `agent.skillsDir ?? nodePath.join(agent.detectPath, SKILLS_DIR)` | `agent.skillsDir` (required) | ✅ Intentional - this change makes `skillsDir` required |

### Key Insight: Dependency Injection Gap

`workspace/apply.ts` currently uses dependency injection for lockfile/settings:

```typescript
export interface ApplyDeps {
  readonly applyStep: (step: PlanStep) => Effect.Effect<void, ApplyError>;
  readonly updateLockfile: (plan: Plan) => Effect.Effect<void, ApplyError>;
  readonly updateSettings: (plan: Plan) => Effect.Effect<void, ApplyError>;
}
```

**Migration approach**: Add built-in implementations to `workspace/apply.ts` by extracting the lockfile/settings logic from `skills/state/apply.ts` lines 690-878. This eliminates the need for handlers to provide deps, simplifying the API:

```typescript
// BEFORE: Handlers must provide deps
yield *
  applyPlan(ws, plan, opts, { applyStep, updateLockfile, updateSettings });

// AFTER: Built-in implementations
yield * applyPlan(ws, plan, opts);
```

### Current Handler Usage

Both install and uninstall handlers use `applyDiff`:

- `install/handler.ts` line 714: `yield* applyDiff(diff, { axmDir, agents })`
- `uninstall/handler.ts` lines 324, 487: `yield* applyDiff(diff, { axmDir, agents: agentConfigs })`

## Testing Strategy

### Dynamic Registry Tests (agents/registry.test.ts)

Tests iterate over `AGENTS` registry automatically - no hardcoded agent lists:

```typescript
import { describe, it, expect } from "vitest";
import { Option, Record } from "effect";
import { AGENTS, getAgentById, getAllAgents } from "./registry.js";

describe("AGENTS registry", () => {
  // Dynamic: test ALL agents automatically
  const agentEntries = Record.toEntries(AGENTS);

  it.each(agentEntries)(
    "agent %s has required skills.projectDir",
    ([id, config]) => {
      expect(config.skills.projectDir).toBeDefined();
      expect(config.skills.projectDir.length).toBeGreaterThan(0);
    },
  );

  it.each(agentEntries)(
    "agent %s projectDir ends with /skills",
    ([id, config]) => {
      // Exception: some agents use .agents/skills
      expect(config.skills.projectDir).toMatch(/\/skills$/);
    },
  );

  it.each(agentEntries)(
    "agent %s globalDir is Option (not undefined)",
    ([id, config]) => {
      expect(Option.isOption(config.skills.globalDir)).toBe(true);
    },
  );

  it.each(agentEntries)("agent %s id matches registry key", ([id, config]) => {
    expect(config.id).toBe(id);
  });

  it("getAgentById returns Option.some for all known agents", () => {
    for (const [id] of agentEntries) {
      const result = getAgentById(id);
      expect(Option.isSome(result)).toBe(true);
    }
  });

  it("getAgentById returns Option.none for unknown agent", () => {
    const result = getAgentById("unknown-agent-xyz");
    expect(Option.isNone(result)).toBe(true);
  });

  it("getAllAgents returns all agents from registry", () => {
    const all = getAllAgents();
    expect(all.length).toBe(agentEntries.length);
  });
});
```

### Dynamic E2E Tests (packages/cli/e2e/)

E2E tests iterate over detected agents - automatically test all configured paths:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getAllAgents, detectAgents } from "@agentxm/core/experimental/agents";
import * as fs from "node:fs";
import * as path from "node:path";

describe("skill installation paths", () => {
  // Test a representative subset of agents (those we can detect in CI)
  const testAgents = getAllAgents().filter((a) =>
    ["claude-code", "cursor", "windsurf"].includes(a.id),
  );

  describe.each(testAgents)("$name", (agent) => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync("/tmp/axm-test-");
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it(`installs to ${agent.skills.projectDir}`, async () => {
      // Run axm install with --agent flag
      const result = await runCli(
        ["skills", "install", "test-skill", "--agent", agent.id],
        { cwd: tmpDir },
      );

      // Verify skill appears in correct location
      const expectedPath = path.join(
        tmpDir,
        agent.skills.projectDir,
        "test-skill",
      );
      expect(fs.existsSync(expectedPath)).toBe(true);
    });

    it(`uninstalls from ${agent.skills.projectDir}`, async () => {
      // Install first
      await runCli(["skills", "install", "test-skill", "--agent", agent.id], {
        cwd: tmpDir,
      });

      // Uninstall
      await runCli(["skills", "uninstall", "test-skill", "--agent", agent.id], {
        cwd: tmpDir,
      });

      // Verify skill removed
      const expectedPath = path.join(
        tmpDir,
        agent.skills.projectDir,
        "test-skill",
      );
      expect(fs.existsSync(expectedPath)).toBe(false);
    });
  });
});
```

### Apply Migration Tests

Before migrating handlers, ensure `workspace/apply.ts` tests cover:

- [ ] `applyStep` InstallSkill copies to canonical location
- [ ] `applyStep` InstallSkill creates symlinks to agent dirs
- [ ] `applyStep` InstallSkill falls back to copy when symlink fails
- [ ] `applyStep` UninstallSkill removes from agent directories
- [ ] `applyStep` UninstallSkill removes from canonical location
- [ ] `applyStep` UpdateSkill removes old + installs new
- [ ] `applyPlan` with `dryRun: true` makes no filesystem changes
- [ ] `applyPlan` calls `onProgress` callback at each step
- [ ] `applyPlan` calls `deps.updateLockfile` on success
- [ ] `applyPlan` calls `deps.updateSettings` on success

## Implementation Changes

### 1. Migrate `AgentConfig` from `types.ts` to `agents/types.ts`

**Current**: `AgentConfig` defined in `packages/core/src/experimental/skills/types.ts`

**New**: Agent types move to dedicated `agents/types.ts` module (see section 2a)

**File**: `packages/core/src/experimental/skills/types.ts`

**Changes**:

```typescript
// REMOVE: AgentConfig interface (moves to experimental/agents/types.ts)
// OLD:
export interface AgentConfig {
  readonly id: string;
  readonly name: string;
  readonly detectPath: string;
  readonly skillsDir?: string;
}

// NEW: Delete from this file. Consumers import from agents/ directly.
```

**Migration notes**:

- `detectPath` removed (detection is now a separate function in `agents/detection.ts`)
- `skillsDir?: string` becomes `skills.projectDir` (required)
- New `skills.globalDir: Option<string>` for global installation support
- Types live in `agents/types.ts` only - no re-exports

### 2. Create Shared `agents/` Module at Experimental Level

**Current**: Single file `skills/agent-detection.ts` with mixed concerns (config + detection)

**New**: Top-level `agents/` module shared across all extension types

```
packages/core/src/experimental/
  agents/                    # NEW: Shared agent configuration module
    index.ts                 # Barrel file
    types.ts                 # AgentConfig, AgentSkillsConfig, AgentId, AgentRegistry
    registry.ts              # AGENTS Record (pure data)
    detection.ts             # detectAgent, detectAgents (effectful)
  skills/
    (agent-detection.ts)     # DELETED - code moves to agents/
    ...
```

**Rationale**:

- **Shared across extension types**: `AgentConfig` used by skills, commands, future extensions
- **Import path**: `@agentxm/core/experimental/agents` (not nested under skills)
- Pure config (`registry.ts`) separated from effectful detection (`detection.ts`)
- Detection logic reusable by workspace-init, CLI commands, etc.

### 2a. Create `agents/types.ts` - Type Definitions

**File**: `packages/core/src/experimental/agents/types.ts`

```typescript
import type { Option, Record } from "effect";

export interface AgentSkillsConfig {
  readonly projectDir: string;
  readonly globalDir: Option.Option<string>;
}

/** Known agent identifiers - exhaustive list from vercel-labs/skills */
export type AgentId =
  | "claude-code"
  | "cursor"
  | "codex"
  | "opencode"
  | "windsurf"
  | "continue"
  | "cline"
  | "goose"
  | "amp"
  | "roo-code"
  | "gemini-cli"
  | "github-copilot"
  | "replit";
/* ... 40+ total from reference */

export interface AgentConfig {
  readonly id: AgentId;
  readonly name: string;
  readonly skills: AgentSkillsConfig;
}

export type AgentRegistry = Record.ReadonlyRecord<AgentId, AgentConfig>;
```

### 2b. Create `agents/registry.ts` - Pure Data Registry

**File**: `packages/core/src/experimental/agents/registry.ts`

```typescript
import * as path from "node:path";
import { Option } from "effect";
import type { AgentConfig, AgentRegistry } from "./types.js";
import { home, configHome, claudeHome, codexHome } from "./constants.js";

export const AGENTS: AgentRegistry = {
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    skills: {
      projectDir: ".claude/skills",
      globalDir: Option.some(path.join(claudeHome, "skills")),
    },
  },
  cursor: {
    id: "cursor",
    name: "Cursor",
    skills: {
      projectDir: ".cursor/skills",
      globalDir: Option.some(path.join(home, ".cursor/skills")),
    },
  },
  // ... all agents with corrected paths per reference
};

/** O(1) lookup by agent ID, returns Option for explicit handling */
export const getAgentById = (id: string): Option.Option<AgentConfig> =>
  Option.fromNullable(AGENTS[id]);

/** All agent IDs */
export const getAgentIds = (): string[] => Object.keys(AGENTS);

/** All agent configs as array (for iteration) */
export const getAllAgents = (): AgentConfig[] => Object.values(AGENTS);
```

### 2c. Create `agents/constants.ts` - Shared Path Constants

**File**: `packages/core/src/experimental/agents/constants.ts`

```typescript
import * as os from "node:os";
import * as path from "node:path";

// Pre-expanded paths at module init (no tilde expansion needed at runtime)
export const home = os.homedir();
export const configHome =
  process.env.XDG_CONFIG_HOME ?? path.join(home, ".config");
export const claudeHome =
  process.env.CLAUDE_CONFIG_DIR ?? path.join(home, ".claude");
export const codexHome = process.env.CODEX_HOME ?? path.join(home, ".codex");
```

### 2d. Create `agents/detection.ts` - Effectful Detection

**File**: `packages/core/src/experimental/agents/detection.ts`

```typescript
import * as path from "node:path";
import { FileSystem } from "@effect/platform";
import { Data, Effect, Record } from "effect";
import type { AgentConfig } from "./types.js";
import { AGENTS } from "./registry.js";
import { home, configHome, claudeHome, codexHome } from "./constants.js";

export class DetectionError extends Data.TaggedError("DetectionError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * Check if a specific agent is installed.
 * Detection logic varies per agent - some check single path, others check multiple.
 */
export const detectAgent = (
  agent: AgentConfig,
): Effect.Effect<boolean, DetectionError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    switch (agent.id) {
      case "claude-code":
        return yield* fs.exists(claudeHome);
      case "cursor":
        return yield* fs.exists(path.join(home, ".cursor"));
      case "codex": {
        const [a, b] = yield* Effect.all([
          fs.exists(codexHome),
          fs.exists("/etc/codex"),
        ]);
        return a || b;
      }
      case "opencode":
        return yield* fs.exists(path.join(configHome, "opencode"));
      // ... per-agent detection logic
      default:
        return false;
    }
  }).pipe(
    Effect.mapError(
      (error) =>
        new DetectionError({
          message: `Failed to detect ${agent.name}`,
          cause: error,
        }),
    ),
  );

/**
 * Detect all installed agents concurrently.
 */
export const detectAgents = (): Effect.Effect<
  AgentConfig[],
  DetectionError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const agents = Record.values(AGENTS);
    const results = yield* Effect.all(
      agents.map((agent) =>
        detectAgent(agent).pipe(
          Effect.map((detected) => (detected ? agent : null)),
        ),
      ),
      { concurrency: "unbounded" },
    );
    return results.filter((a): a is AgentConfig => a !== null);
  });
```

### 2e. Create `agents/index.ts` - Barrel File

**File**: `packages/core/src/experimental/agents/index.ts`

```typescript
// Types
export type {
  AgentConfig,
  AgentId,
  AgentRegistry,
  AgentSkillsConfig,
} from "./types.js";

// Registry (pure data)
export { AGENTS, getAgentById, getAgentIds, getAllAgents } from "./registry.js";

// Detection (effectful)
export { detectAgent, detectAgents, DetectionError } from "./detection.js";
```

### 2f. Delete `skills/agent-detection.ts`

**File**: `packages/core/src/experimental/skills/agent-detection.ts`

**Action**: Delete this file entirely. All agent-related code moves to `agents/` module.

### 3. Delete Dead Code (`installer.ts`)

**Files to delete** (unused, superseded by state/apply.ts pattern):

- `packages/core/src/experimental/skills/installer.ts`
- `packages/core/src/experimental/skills/installer.test.ts`

**Exports to remove from `skills/index.ts`** (lines 28-38):

```typescript
// DELETE these exports - dead code
export type { InstallMethod, InstallResult } from "./installer.js";
export {
  copySkillToCanonical,
  copyToAgent,
  createAgentSymlink,
  InstallError,
  installSkill,
  installSkillToAgents,
  removeSkillFromAgents,
} from "./installer.js";
```

**Rationale**: This code is exported but never imported by production code (grep shows zero imports). All file operations go through `skills/state/apply.ts` (legacy) or `workspace/apply.ts` (new).

### 4. Update Consumers - Handler and State Files

**Files to update**:

| File                                                    | Change                                               |
| ------------------------------------------------------- | ---------------------------------------------------- |
| `packages/cli/src/commands/skills/install/handler.ts`   | Update to use `agent.skills.projectDir`              |
| `packages/cli/src/commands/skills/uninstall/handler.ts` | Update to use `agent.skills.projectDir`              |
| `packages/core/src/experimental/skills/state/ideal.ts`  | Update agent usage if accessing skillsDir            |
| `packages/core/src/experimental/skills/state/load.ts`   | Update agent usage if accessing skillsDir            |
| `packages/core/src/experimental/workspace/apply.ts`     | Update agent usage if accessing skillsDir (see note) |

**Note on apply.ts**: The authoritative apply implementation is `workspace/apply.ts` (per `docs/designs/dry-run.md`). This change migrates CLI handlers from `skills/state/apply.ts` to `workspace/apply.ts` and deletes the legacy implementation.

### 5. Update Tests

**New test files** (in `packages/core/src/experimental/agents/`):

- `agents/registry.test.ts` - Test AGENTS registry, getAgentById, getAllAgents
- `agents/detection.test.ts` - Test detectAgent, detectAgents

**Updated test files**:

- `packages/core/src/experimental/workspace/apply.test.ts` - Update mocks for new config
- `packages/core/src/experimental/skills/agent-detection.test.ts` - Remove (code moved to agents/)
- `packages/cli/e2e/skills-install.test.ts` - Verify correct paths in E2E
- `packages/cli/e2e/skills-uninstall.test.ts` - Verify correct paths in E2E

**Deleted test files** (tests dead code):

- `packages/core/src/experimental/skills/installer.test.ts`

**Test updates**:

```typescript
// OLD: Mock with optional skillsDir
const mockAgent: AgentConfig = {
  id: "test-agent",
  name: "Test Agent",
  detectPath: "~/.test",
  skillsDir: ".test/skills",
};

// NEW: Mock with required skills property
const mockAgent: AgentConfig = {
  id: "test-agent",
  name: "Test Agent",
  skills: {
    projectDir: ".test/skills",
    globalDir: Option.none(),
  },
};
```

### 6. Export Updates

#### 6a. Update `experimental/index.ts` - Add agents export

**File**: `packages/core/src/experimental/index.ts`

```typescript
// ADD: Export agents module
export * as Agents from "./agents/index.js";
```

#### 6b. Update `skills/index.ts` - Remove agent exports

**File**: `packages/core/src/experimental/skills/index.ts`

```typescript
// REMOVE all agent-related exports:
// - AgentConfig, SUPPORTED_AGENTS, detectAgents, getAgentById, DetectionError
// These now live exclusively in @agentxm/core/experimental/agents
```

#### 6c. Consumer import paths

```typescript
// Import from agents module (only option)
import {
  AGENTS,
  detectAgents,
  type AgentConfig,
} from "@agentxm/core/experimental/agents";
```

## Integration with State Management

This section details how the `agents/` module integrates with the skills state management lifecycle: loading current state, building ideal state, and applying changes.

### Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Install Command Flow                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Handler                     2. State                    3. Apply        │
│  ───────────                    ─────────                   ─────────       │
│                                                                             │
│  ┌──────────────┐              ┌──────────────┐            ┌──────────────┐ │
│  │ detectAgents │──AgentConfig[]──►│buildIdeal   │            │ applyPlan    │ │
│  │ getAgentById │              │ ForInstall   │            │ (workspace/) │ │
│  └──────────────┘              └──────────────┘            └──────────────┘ │
│        │                              │                           │         │
│        │                              ▼                           │         │
│        │                       ┌──────────────┐                   │         │
│        │                       │ IdealSkill   │                   │         │
│        │                       │ .agents: ID[]│───────────────────┤         │
│        │                       └──────────────┘                   │         │
│        │                                                          │         │
│        └──────────────────────────────────────────────────────────┤         │
│                           AgentConfig[]                           ▼         │
│                                                          ┌──────────────┐   │
│                                                          │agent.skills  │   │
│                                                          │.projectDir   │   │
│                                                          └──────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1. Handler Layer (`handler.ts`)

The CLI handler orchestrates the flow:

```typescript
// Import from agents module
import {
  detectAgents,
  getAgentById,
  type AgentConfig,
} from "@agentxm/core/experimental/agents";

// Step 1: Detect or resolve agents
const agents: AgentConfig[] =
  args.agent.length > 0
    ? args.agent.map(getAgentById).filter(Option.isSome).map(Option.getOrThrow)
    : yield * detectAgents();

// Step 2: Pass agent IDs to ideal state builder
const ideal =
  yield *
  buildIdealForInstall(currentState, resolvedSource, {
    agents: agents.map((a) => a.id), // IdealSkill stores IDs, not full configs
    // ...
  });

// Step 3: Build plan and apply via workspace/apply.ts
const plan = buildPlan(currentState, ideal);
yield *
  applyPlan(workspaceContext, plan, {
    agents, // Full AgentConfig[] for skills.projectDir access
    onProgress: (event) => {
      /* ... */
    },
  });
```

**Changes needed:**

| Location  | Current                                               | New                           |
| --------- | ----------------------------------------------------- | ----------------------------- |
| Line ~384 | `getAgentById(id)` returns `AgentConfig \| undefined` | Returns `Option<AgentConfig>` |
| Line ~448 | `a.skillsDir` in hint                                 | `a.skills.projectDir`         |

### 2. Ideal State (`ideal.ts`)

The ideal state builder receives agent IDs and stores them in `IdealSkill`:

```typescript
interface IdealSkill {
  readonly name: string;
  readonly source: SkillSource;
  readonly gitTreeFolderHash: string;
  readonly description: Option.Option<string>;
  readonly agents: string[]; // Stores agent IDs, not full configs
}
```

**No changes needed** - ideal state already works with agent IDs. The lockfile stores agent IDs.

### 3. Full Workspace Migration

This change completes the migration from `skills/state/*` to `workspace/*`. The workspace modules already exist with V2 types:

| Component   | Legacy (skills/state/) | New (workspace/)    | Handler Migration                          |
| ----------- | ---------------------- | ------------------- | ------------------------------------------ |
| Load state  | `load.ts`              | `load-state.ts` ✅  | `loadSkillsState` → `loadCurrentState`     |
| Build ideal | `ideal.ts`             | `ideal-state.ts` ✅ | `buildIdealForInstall` → `buildIdealState` |
| Apply       | `apply.ts`             | `apply.ts` ✅       | `applyDiff` → `applyPlan`                  |

**Agent path resolution change (in workspace/apply.ts):**

```typescript
// OLD: Fallback logic using detectPath (causes bugs with unexpanded tildes)
const agentSkillsDir =
  agent.skillsDir ?? nodePath.join(agent.detectPath, SKILLS_DIR);

// NEW: Direct access to required property
const agentSkillsDir = agent.skills.projectDir;
```

**Changes needed in `workspace/apply.ts`:**

| Location                    | Change                                      |
| --------------------------- | ------------------------------------------- |
| `syncToAgents` line 465     | Use `agent.skills.projectDir`               |
| `removeFromAgents` line 518 | Use `agent.skills.projectDir`               |
| `applyPlan`                 | Add built-in lockfile/settings update logic |

**Handler migration pattern:**

```typescript
// OLD: Legacy skills/state/* pipeline
const state = yield* loadSkillsState(axmDir);
const ideal = yield* buildIdealForInstall(state, { source, agents, ... });
const diff = computeDiff(state, ideal);
yield* applyDiff(diff, { axmDir, agents });

// NEW: Workspace V2 pipeline
const ws = makeWorkspaceContext({ path: axmDir, global: false });
const current = yield* loadCurrentState(ws);
const ideal = yield* buildIdealState(current, { _tag: "skills-install", ... }, deps);
const plan = buildPlan(current, ideal);
yield* applyPlan(ws, plan, { dryRun: false });
```

### 3a. Apply Architecture

Current vs new apply pattern:

#### Interface Differences

| Aspect       | Legacy `applyDiff`                             | New `applyPlan`                 |
| ------------ | ---------------------------------------------- | ------------------------------- |
| Input        | `SkillsDiff` (add/remove/update arrays)        | `Plan` with `PlanStep[]`        |
| Error        | `ApplyError { operation }`                     | `ApplyError { step }`           |
| Dry-run      | Handled in caller                              | Built-in `opts.dryRun`          |
| Progress     | `ApplyProgressEvent` stream via `Stream.async` | `opts.onProgress` callback      |
| Dependencies | `ApplyDeps` interface injection                | `FileSystem.FileSystem` service |

#### Feature Parity Audit

Ensure `workspace/apply.ts` supports all operations from `skills/state/apply.ts`:

| Feature              | `skills/state/apply.ts`       | `workspace/apply.ts`        | Action |
| -------------------- | ----------------------------- | --------------------------- | ------ |
| Copy to canonical    | `copyDirectory()`             | `applyStep` CopyCanonical   | Verify |
| Create symlink       | inline in `applyAdd`          | `applyStep` CreateSymlink   | Verify |
| Copy fallback        | inline in `applyAdd`          | `applyStep` CopyFallback    | Verify |
| Remove from agents   | `applyRemove()`               | `applyStep` RemoveFromAgent | Verify |
| Remove canonical     | `applyRemove()`               | `applyStep` RemoveCanonical | Verify |
| Lockfile update      | `updateLockEntry()`           | `applyStep` UpdateLock      | Verify |
| Concurrent agent ops | `Effect.all` with concurrency | Same pattern                | Verify |

#### Progress Reporting Migration

```typescript
// OLD: Stream-based progress (skills/state/apply.ts)
const applyDiff = (...): Stream.Stream<ApplyProgressEvent, ApplyError> =>
  Stream.async((emit) => {
    // emit.single({ type: "start", ... })
    // emit.single({ type: "complete", ... })
  });

// NEW: Callback-based progress (workspace/apply.ts)
interface ApplyOptions {
  onProgress?: (event: ApplyProgressEvent) => void;
}

const applyPlan = (ws, plan, opts): Effect.Effect<void, ApplyError, FileSystem> =>
  Effect.gen(function* () {
    opts.onProgress?.({ type: "start", step });
    // ... do work ...
    opts.onProgress?.({ type: "complete", step });
  });
```

**Handler migration**: Convert stream consumption to callback:

```typescript
// OLD: Consume stream
yield *
  Stream.runForEach(applyDiff(diff, opts), (event) =>
    Effect.sync(() => renderProgress(event)),
  );

// NEW: Pass callback
yield *
  applyPlan(ws, plan, {
    ...opts,
    onProgress: (event) => renderProgress(event),
  });
```

### 4. Load State (`load.ts`)

The state loader reads from canonical `.axm/skills/` location - **no agent config needed**.

```typescript
// loadActualSkills - reads from .axm/skills/ (canonical location)
// loadLockedSkills - reads from lockfile
// Neither needs AgentConfig - they work with canonical paths only
```

**No changes needed** - state loading is agent-agnostic.

### 5. Agent Resolution Flow

```typescript
// In handler: resolve agent IDs to full configs
const resolveAgents = (
  agentIds: readonly string[],
): Effect.Effect<AgentConfig[], InstallError> =>
  Effect.gen(function* () {
    const resolved = pipe(
      agentIds,
      Array.filterMap((id) => getAgentById(id)), // Returns Option<AgentConfig>
    );

    if (resolved.length !== agentIds.length) {
      const missing = agentIds.filter((id) => Option.isNone(getAgentById(id)));
      yield* Effect.fail(
        new InstallError({
          message: `Unknown agents: ${missing.join(", ")}`,
          retryable: false,
        }),
      );
    }

    return resolved;
  });
```

### 6. Lockfile Storage

The lockfile stores agent IDs (not full configs):

```yaml
# axm-lock.yaml
skills:
  my-skill:
    source: github
    owner: example
    repo: skills
    gitTreeHash: abc123
    agents: ["claude-code", "cursor"] # IDs only
    installedAt: 2024-01-01T00:00:00Z
    updatedAt: 2024-01-01T00:00:00Z
```

**No changes needed** - lockfile schema remains the same.

### 7. Import Path Updates

```typescript
// BEFORE: Import from skills module
import {
  detectAgents,
  getAgentById,
  type AgentConfig,
} from "@agentxm/core/experimental/skills";

// AFTER: Import from agents module
import {
  detectAgents,
  getAgentById,
  type AgentConfig,
} from "@agentxm/core/experimental/agents";
```

### Summary of Changes by File

| File                                       | Changes                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| **New Files**                              |                                                                                  |
| `agents/types.ts`                          | New: `AgentConfig`, `AgentSkillsConfig`, `AgentId`, `AgentRegistry`              |
| `agents/constants.ts`                      | New: Shared path constants (`home`, `configHome`, etc.)                          |
| `agents/registry.ts`                       | New: `AGENTS` Record, `getAgentById`, `getAllAgents`                             |
| `agents/detection.ts`                      | New: `detectAgent`, `detectAgents`, `DetectionError`                             |
| `agents/index.ts`                          | New: Barrel file                                                                 |
| `agents/registry.test.ts`                  | New: Dynamic registry tests                                                      |
| `agents/detection.test.ts`                 | New: Detection tests                                                             |
| **Deleted Files**                          |                                                                                  |
| `skills/installer.ts`                      | **DELETE** - dead code, never imported                                           |
| `skills/installer.test.ts`                 | **DELETE** - tests deleted code                                                  |
| `skills/agent-detection.ts`                | **DELETE** - moved to `agents/`                                                  |
| `skills/agent-detection.test.ts`           | **DELETE** - moved to `agents/`                                                  |
| `skills/state/apply.ts`                    | **DELETE** - superseded by `workspace/apply.ts`                                  |
| `skills/state/apply.test.ts`               | **DELETE** - tests deleted code                                                  |
| `skills/state/load.ts`                     | **DELETE** - superseded by `workspace/load-state.ts`                             |
| `skills/state/load.test.ts`                | **DELETE** - tests deleted code                                                  |
| `skills/state/ideal.ts`                    | **DELETE** - superseded by `workspace/ideal-state.ts`                            |
| `skills/state/ideal.test.ts`               | **DELETE** - tests deleted code                                                  |
| `skills/state/diff.ts`                     | **DELETE** - logic moves to workspace buildPlan                                  |
| `skills/state/diff.test.ts`                | **DELETE** - tests deleted code                                                  |
| **Modified Files**                         |                                                                                  |
| `experimental/index.ts`                    | Add `agents/` module export                                                      |
| `workspace/apply.ts`                       | Add built-in lockfile/settings updates, use `agent.skills.projectDir`            |
| `workspace/load-state.ts`                  | Update imports if needed                                                         |
| `workspace/ideal-state.ts`                 | Update imports if needed                                                         |
| `skills/types.ts`                          | Remove `AgentConfig` (moved to `agents/`)                                        |
| `skills/state/types.ts`                    | Keep V2 types, remove legacy types, update any agent references to use `agents/` |
| `skills/index.ts`                          | Remove installer + agent + legacy state exports                                  |
| `cli/commands/skills/install/handler.ts`   | Migrate to workspace pipeline                                                    |
| `cli/commands/skills/uninstall/handler.ts` | Migrate to workspace pipeline                                                    |
| `cli/commands/init/handler.ts`             | Migrate to workspace pipeline if using apply                                     |

## Implementation Approach

### Principles

1. **Incremental delivery** - Each phase produces working code; verify before proceeding
2. **Tests before deletion** - Never delete code until replacement is tested
3. **One concern at a time** - Separate structural changes from behavioral changes

### Phase Sequencing

```
Phase 1: Delete Dead Code (installer.ts)
    │ No risk - code is unused
    │ GATE: pnpm typecheck
    ▼
Phase 2: Create agents/ Module (new code only)
    │ Low risk - additive, no existing code changes
    │ GATE: Dynamic registry tests pass
    ▼
Phase 3: Enhance workspace/apply.ts
    │ Medium risk - add lockfile/settings update logic
    │ GATE: workspace/apply.test.ts covers all operations
    ▼
Phase 4: Migrate Handlers to applyPlan
    │ High risk - core file operations, migrate one handler at a time
    │ GATE: E2E tests pass after each handler migration
    ▼
Phase 5: Cleanup Old Code
    │ Low risk - delete superseded code (agents move, apply delete)
    │ GATE: Full test suite passes
    ▼
Done
```

### Type Compatibility During Transition

**Critical**: During Phases 2-4, two `AgentConfig` types coexist:

- `skills/types.ts`: Old shape (`detectPath`, optional `skillsDir`)
- `agents/types.ts`: New shape (`skills.projectDir`, `skills.globalDir`)

**Strategy**: Phase 4 migrates handlers atomically - each handler switches from:

1. Old imports (`skills/`) → New imports (`agents/`)
2. Old pipeline (`applyDiff`) → New pipeline (`applyPlan`)

Both changes happen together per handler to avoid type mismatches. The old code remains functional until deleted in Phase 5.

**Constraint**: V2 types in `workspace/` must only reference the new `agents/` types. If any V2 type (e.g., `CurrentSkill`, `IdealSkill`, `Plan`, `PlanStep`) references `AgentConfig`, it must use the new definition from `agents/types.ts`, not the old one from `skills/types.ts`. This ensures the workspace pipeline is fully decoupled from legacy code.

## Migration Checklist

### Phase 1: Delete Dead Code (No Risk)

The `installer.ts` module is exported but never imported - safe to delete immediately.

- [ ] Delete `packages/core/src/experimental/skills/installer.ts`
- [ ] Delete `packages/core/src/experimental/skills/installer.test.ts`
- [ ] Remove exports from `skills/index.ts` (lines 28-38):
  ```typescript
  // DELETE these lines
  export type { InstallMethod, InstallResult } from "./installer.js";
  export { copySkillToCanonical, copyToAgent, ... } from "./installer.js";
  ```
- [ ] `pnpm typecheck` passes (confirms nothing imports deleted code)

### Phase 2: Create `agents/` Module (Additive, Low Risk)

Create new module with correct paths. No existing code changes yet.

**2.1 Create type definitions:**

- [ ] Create `packages/core/src/experimental/agents/` directory
- [ ] Create `agents/types.ts` with `AgentConfig`, `AgentSkillsConfig`, `AgentId`, `AgentRegistry`

**2.2 Create constants:**

- [ ] Create `agents/constants.ts` with shared path constants (`home`, `configHome`, `claudeHome`, `codexHome`)

**2.3 Create registry:**

- [ ] Create `agents/registry.ts` with `AGENTS` Record
- [ ] Import path constants from `constants.ts`
- [ ] Source paths from [vercel-labs/skills/src/agents.ts](https://github.com/vercel-labs/skills/blob/main/src/agents.ts)
- [ ] Adapt to Effect idioms (Option for globalDir)

**2.4 Create detection:**

- [ ] Create `agents/detection.ts` with `detectAgent`, `detectAgents`
- [ ] Import path constants from `constants.ts`
- [ ] Detection logic per agent (based on reference implementation)

**2.5 Create barrel file:**

- [ ] Create `agents/index.ts` exporting types, registry, and detection
- [ ] Update `experimental/index.ts` to export `agents/` module

**2.6 Add dynamic tests:**

- [ ] Create `agents/registry.test.ts` with dynamic `it.each(AGENTS)` tests
- [ ] Create `agents/detection.test.ts` with detection tests

**VERIFICATION GATE:**

```bash
pnpm test packages/core/src/experimental/agents/
# All registry tests pass
# All detection tests pass
```

### Phase 3: Enhance workspace/apply.ts (Medium Risk)

Add built-in lockfile/settings update logic to `workspace/apply.ts`. Currently these are injected via `ApplyDeps`, but we need real implementations.

**3.1 Extract reusable update functions:**

Extract from `skills/state/apply.ts` lines 690-878 into `workspace/apply.ts`:

- [ ] Create `updateLockfileForPlan(axmDir: string, plan: Plan, results: ApplySkillResult[])`
  - Reads current lockfile
  - Adds/updates/removes entries based on plan steps
  - Writes updated lockfile
- [ ] Create `updateSettingsForPlan(axmDir: string, plan: Plan, results: ApplySkillResult[])`
  - Reads current settings
  - Adds/updates/removes skill sources
  - Writes updated settings

**3.2 Update `applyPlan` to use built-in updates:**

Change from dependency injection to built-in:

```typescript
// OLD: Injected deps
export const applyPlan = (ws, plan, opts, deps: ApplyDeps) => ...

// NEW: Built-in implementations
export const applyPlan = (ws, plan, opts: ApplyOptions) =>
  Effect.gen(function* () {
    // ... execute steps ...
    if (allSucceeded) {
      yield* updateLockfileForPlan(ws.axmDir, plan, results);
      yield* updateSettingsForPlan(ws.axmDir, plan, results);
    }
  });
```

**3.3 Update agent path resolution:**

- [ ] Change `syncToAgents` from `agent.skillsDir` to `agent.skills.projectDir`
- [ ] Change `removeFromAgents` from `agent.skillsDir` to `agent.skills.projectDir`
- [ ] Update `AgentConfig` import to use `agents/` module
- [ ] Remove silent skip for agents without `skillsDir`:

  ```typescript
  // REMOVE this pattern (current workspace/apply.ts line 463):
  if (!agent.skillsDir) continue; // Silent skip - agents never get skills installed

  // NEW: skills.projectDir is required, no skip needed
  const agentSkillsDir = agent.skills.projectDir; // Always defined
  ```

- [ ] Add test: verify all agents in plan receive skill installation (no silent skips)

**3.4 Add comprehensive tests:**

- [ ] Test `applyStep` InstallSkill copies to canonical + syncs to agents
- [ ] Test `applyStep` UninstallSkill removes from agents + canonical
- [ ] Test `applyStep` UpdateSkill removes old + installs new
- [ ] Test `applyPlan` updates lockfile on success
- [ ] Test `applyPlan` updates settings on success
- [ ] Test `applyPlan` with `dryRun: true` makes no changes

**VERIFICATION GATE:**

```bash
pnpm test packages/core/src/experimental/workspace/apply.test.ts
# All apply tests pass
```

### Phase 4: Migrate Handlers to Workspace Pipeline (High Risk)

Migrate CLI handlers one at a time from `skills/state/*` to `workspace/*`. Each handler migration is a mini-milestone.

**4.1 Migrate install handler:**

Full pipeline migration:

- [ ] Update imports: `agents/` module + `workspace/*` modules
- [ ] Replace legacy pipeline with workspace V2:

  ```typescript
  // FROM:
  const state = yield* loadSkillsState(axmDir);
  const ideal = yield* buildIdealForInstall(state, ...);
  const diff = computeDiff(state, ideal);
  yield* applyDiff(diff, { axmDir, agents });

  // TO:
  const ws = makeWorkspaceContext({ path: axmDir, global: false });
  const current = yield* loadCurrentState(ws);
  const ideal = yield* buildIdealState(current, { _tag: "skills-install", ... }, deps);
  const plan = buildPlan(current, ideal);
  yield* applyPlan(ws, plan, { dryRun: false });
  ```

- [ ] Update progress event handling (simpler in new API)
- [ ] Run E2E tests for install command
- [ ] **GATE: `pnpm test:e2e -- --grep install` passes**

**4.2 Migrate uninstall handler:**

- [ ] Update imports: `agents/` module + `workspace/*` modules
- [ ] Replace legacy pipeline calls (lines 324, 487) with workspace V2
- [ ] Handle partial uninstall case (see note below)
- [ ] Run E2E tests for uninstall command
- [ ] **GATE: `pnpm test:e2e -- --grep uninstall` passes**

**4.3 Migrate init handler (if applicable):**

- [ ] Check if init uses skills/state functions
- [ ] Update to workspace pipeline if needed

**4.4 Update test mocks:**

- [ ] Update all test files using `AgentConfig` to new structure:

  ```typescript
  // OLD
  const mockAgent = {
    id: "test",
    name: "Test",
    detectPath: "~/.test",
    skillsDir: ".test/skills",
  };

  // NEW
  const mockAgent = {
    id: "test",
    name: "Test",
    skills: { projectDir: ".test/skills", globalDir: Option.none() },
  };
  ```

**4.2.1 Fix partial uninstall path resolution:**

The `handlePartialUninstall()` function (uninstall/handler.ts lines 497-536) bypasses the state pattern and uses the same broken path resolution:

```typescript
// Line 502 - BROKEN: uses unexpanded tilde path
const agentSkillsDir =
  agent.skillsDir ?? nodePath.join(agent.detectPath, "skills");
```

**Required fix** (in scope for this change):

- [ ] Update `handlePartialUninstall` to use `agent.skills.projectDir` instead of fallback pattern
- [ ] Import `AgentConfig` from `agents/` module
- [ ] The bypass pattern can remain (refactoring to use `PlanStep` is out of scope), but paths must be correct

**VERIFICATION GATE:**

```bash
pnpm typecheck
pnpm test
pnpm test:e2e  # Full E2E suite
```

### Phase 5: Cleanup Old Code (Low Risk)

Remove superseded code after Phase 4 verification passes.

**5.1 Delete superseded skills/state/ modules:**

- [ ] Delete `skills/state/apply.ts` (superseded by `workspace/apply.ts`)
- [ ] Delete `skills/state/apply.test.ts`
- [ ] Delete `skills/state/load.ts` (superseded by `workspace/load-state.ts`)
- [ ] Delete `skills/state/load.test.ts`
- [ ] Delete `skills/state/ideal.ts` (superseded by `workspace/ideal-state.ts`)
- [ ] Delete `skills/state/ideal.test.ts`
- [ ] Delete `skills/state/diff.ts` (logic in workspace buildPlan)
- [ ] Delete `skills/state/diff.test.ts`
- [ ] Keep `skills/state/types.ts` (V2 types used by workspace/)
- [ ] Keep `skills/state/pure-functions.ts` (utility functions)
- [ ] Update `skills/state/index.ts` to only export kept modules
- [ ] Remove legacy state exports from `skills/index.ts`

**5.2 Delete superseded agent code:**

- [ ] Remove `AgentConfig` from `skills/types.ts` (now in `agents/types.ts`)
- [ ] Remove agent exports from `skills/index.ts` (`SUPPORTED_AGENTS`, `detectAgents`, etc.)
- [ ] Delete `skills/agent-detection.ts` entirely (moved to `agents/`)
- [ ] Delete `skills/agent-detection.test.ts`

**5.3 Clean up types:**

- [ ] Remove legacy types from `skills/state/types.ts` (keep only V2 types)
- [ ] **V2 types must reference new `agents/` types only** — update any V2 type that references old `AgentConfig` (from `skills/types.ts`) to use the new `AgentConfig` (from `agents/types.ts`)
- [ ] Verify no V2 types import from `skills/types.ts` or `skills/agent-detection.ts`
- [ ] Consider moving V2 types to `workspace/types.ts` (optional, can defer)

**FINAL VERIFICATION:**

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
```
