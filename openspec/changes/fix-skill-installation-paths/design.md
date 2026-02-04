## Context

The `SUPPORTED_AGENTS` array in `agent-detection.ts` defines where skills are installed for each AI coding agent. Current paths were chosen speculatively (e.g., `.claude/commands` for Claude Code's slash commands feature) but don't match the Agent Skills specification.

The [agentskills.io](https://agentskills.io) specification and [vercel-labs/skills](https://github.com/vercel-labs/skills) reference implementation establish the canonical patterns for skill installation.

## Goals / Non-Goals

**Goals:**

- Match vercel-labs/skills agent configurations exactly
- Support all 40+ agents from the reference implementation
- Adopt the reference `AgentConfig` interface structure

**Non-Goals:**

- Migration tooling for existing installations
- Backward compatibility with old paths
- Canonical storage (`.agents/skills/`) - defer to future change

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

/** Agent identifier type for type-safe lookups */
type AgentId =
  | "claude-code"
  | "cursor"
  | "codex"
  | "opencode"
  | /* ... */ string;

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

**[Existing installations orphaned]** → Users must move skills manually. No migration tooling.

**[Reference drift]** → Periodically sync with vercel-labs/skills. Consider automation.

**[Effect vs Promise mismatch]** → Reference uses raw promises; we wrap in Effect. Minor friction when syncing.

## Testing

- [ ] Unit test: All agents in `AGENTS` have `skills.projectDir` defined
- [ ] Unit test: All `skills.projectDir` paths end with `/skills` (except documented exceptions)
- [ ] Unit test: `skills.globalDir` is `Option.some` or `Option.none` (no undefined)
- [ ] Unit test: `detectAgent` returns Effect for each agent ID
- [ ] Unit test: Agent lookup by ID is O(1) via Record
- [ ] E2E test: Skill installs to `.claude/skills/` for Claude Code
- [ ] E2E test: Skill installs to `.cursor/skills/` for Cursor
