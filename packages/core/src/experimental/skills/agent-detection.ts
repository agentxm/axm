/**
 * Agent detection module for discovering installed AI coding agents.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as os from "node:os";
import * as path from "node:path";
import { FileSystem } from "@effect/platform";
import { Data, Effect } from "effect";
import type { AgentConfig } from "./types.js";

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

/**
 * Error that occurs during agent detection.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class DetectionError extends Data.TaggedError("DetectionError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// -----------------------------------------------------------------------------
// Supported Agents
// -----------------------------------------------------------------------------

/**
 * List of all supported AI coding agents with their detection paths.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SUPPORTED_AGENTS: AgentConfig[] = [
  // Anthropic
  {
    id: "claude-code",
    name: "Claude Code",
    detectPath: "~/.claude",
    skillsDir: ".claude/commands",
  },

  // Cursor
  {
    id: "cursor",
    name: "Cursor",
    detectPath: "~/.cursor",
    skillsDir: ".cursor/rules",
  },

  // OpenAI
  {
    id: "codex",
    name: "Codex CLI",
    detectPath: "~/.codex",
    skillsDir: ".codex/instructions",
  },

  // Codeium
  {
    id: "windsurf",
    name: "Windsurf",
    detectPath: "~/.windsurf",
    skillsDir: ".windsurf/rules",
  },

  // Zed
  {
    id: "zed",
    name: "Zed",
    detectPath: "~/.zed",
  },

  // VS Code (for Continue/Cline/other AI extensions)
  {
    id: "vscode",
    name: "VS Code",
    detectPath: "~/.vscode",
  },

  // Aider
  {
    id: "aider",
    name: "Aider",
    detectPath: "~/.aider",
  },

  // Sourcegraph Cody
  {
    id: "cody",
    name: "Cody",
    detectPath: "~/.cody",
  },

  // GitHub Copilot (via VS Code extension storage)
  {
    id: "copilot",
    name: "GitHub Copilot",
    detectPath: "~/.config/github-copilot",
  },

  // Amazon Q Developer (formerly CodeWhisperer)
  {
    id: "amazon-q",
    name: "Amazon Q Developer",
    detectPath: "~/.aws/amazonq",
  },

  // Tabnine
  {
    id: "tabnine",
    name: "Tabnine",
    detectPath: "~/.tabnine",
  },

  // Replit AI
  {
    id: "replit",
    name: "Replit AI",
    detectPath: "~/.replit",
  },

  // JetBrains AI
  {
    id: "jetbrains-ai",
    name: "JetBrains AI",
    detectPath: "~/.config/JetBrains",
  },

  // Warp Terminal
  {
    id: "warp",
    name: "Warp",
    detectPath: "~/.warp",
  },

  // Fig (now part of Amazon)
  {
    id: "fig",
    name: "Fig",
    detectPath: "~/.fig",
  },

  // Continue (VS Code extension)
  {
    id: "continue",
    name: "Continue",
    detectPath: "~/.continue",
    skillsDir: ".continue/rules",
  },

  // Cline (VS Code extension)
  {
    id: "cline",
    name: "Cline",
    detectPath: "~/.cline",
  },

  // Supermaven
  {
    id: "supermaven",
    name: "Supermaven",
    detectPath: "~/.supermaven",
  },

  // Phind
  {
    id: "phind",
    name: "Phind",
    detectPath: "~/.phind",
  },

  // Blackbox AI
  {
    id: "blackbox",
    name: "Blackbox AI",
    detectPath: "~/.blackbox",
  },

  // Codium AI
  {
    id: "codiumai",
    name: "Codium AI",
    detectPath: "~/.codiumai",
  },

  // Bito AI
  {
    id: "bito",
    name: "Bito AI",
    detectPath: "~/.bito",
  },

  // Pieces
  {
    id: "pieces",
    name: "Pieces",
    detectPath: "~/.pieces",
  },

  // Mintlify
  {
    id: "mintlify",
    name: "Mintlify",
    detectPath: "~/.mintlify",
  },

  // Sourcery
  {
    id: "sourcery",
    name: "Sourcery",
    detectPath: "~/.sourcery",
  },

  // Kite (deprecated but may still be installed)
  {
    id: "kite",
    name: "Kite",
    detectPath: "~/.kite",
  },

  // Codegeex
  {
    id: "codegeex",
    name: "CodeGeeX",
    detectPath: "~/.codegeex",
  },

  // AI Aide
  {
    id: "ai-aide",
    name: "AI Aide",
    detectPath: "~/.ai-aide",
  },

  // Roo Cline (fork of Cline)
  {
    id: "roo-cline",
    name: "Roo Cline",
    detectPath: "~/.roo-cline",
  },

  // Void
  {
    id: "void",
    name: "Void",
    detectPath: "~/.void",
  },

  // MutableAI
  {
    id: "mutableai",
    name: "MutableAI",
    detectPath: "~/.mutableai",
  },

  // Refact
  {
    id: "refact",
    name: "Refact",
    detectPath: "~/.refact",
  },

  // Sweep
  {
    id: "sweep",
    name: "Sweep",
    detectPath: "~/.sweep",
  },
];

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Expands `~` to the user's home directory.
 *
 * @internal
 */
const expandPath = (p: string): string => {
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  if (p === "~") {
    return os.homedir();
  }
  return p;
};

// -----------------------------------------------------------------------------
// Detection Functions
// -----------------------------------------------------------------------------

/**
 * Checks if a single agent is installed by verifying its detection path exists.
 *
 * @internal
 */
const checkAgent = (
  agent: AgentConfig,
): Effect.Effect<AgentConfig | null, DetectionError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const expandedPath = expandPath(agent.detectPath);

    const exists = yield* fs.exists(expandedPath).pipe(
      Effect.catchAll((error) =>
        Effect.fail(
          new DetectionError({
            message: `Failed to check path for ${agent.name}: ${expandedPath}`,
            cause: error,
          }),
        ),
      ),
    );

    return exists ? agent : null;
  });

/**
 * Detects installed AI coding agents by checking configuration directories.
 *
 * Runs all detection checks concurrently for speed.
 *
 * @experimental This API is unstable and may change without notice.
 *
 * @example
 * ```typescript
 * import { detectAgents } from "@agentxm/core/experimental/skills";
 * import { NodeFileSystem } from "@effect/platform-node";
 * import { Effect } from "effect";
 *
 * const program = detectAgents().pipe(
 *   Effect.provide(NodeFileSystem.layer),
 * );
 *
 * const agents = await Effect.runPromise(program);
 * console.log("Detected agents:", agents.map(a => a.name));
 * ```
 */
export const detectAgents = (): Effect.Effect<
  AgentConfig[],
  DetectionError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const results = yield* Effect.all(
      SUPPORTED_AGENTS.map((agent) => checkAgent(agent)),
      { concurrency: "unbounded" },
    );

    // Filter out null values (agents not detected)
    return results.filter((agent): agent is AgentConfig => agent !== null);
  });

/**
 * Gets an agent configuration by its ID.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getAgentById = (id: string): AgentConfig | undefined =>
  SUPPORTED_AGENTS.find((agent) => agent.id === id);

/**
 * Gets all supported agent IDs.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getSupportedAgentIds = (): string[] => SUPPORTED_AGENTS.map((agent) => agent.id);
