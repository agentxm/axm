/**
 * Byte-for-byte conversion table for the agent-integration typed failure family.
 * Each row travels the real `toAppError` path and pins the envelope its
 * construction site rendered before decoupling; a wording change in the
 * producing module fails here rather than silently reaching the terminal.
 */

import { describe, expect, it } from "vitest";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { AppError, type AppErrorCode } from "../app-error.js";
import { isKnownFailure, toAppError, type KnownFailure } from "../conversions.js";
import {
  HookConfigInvalid,
  HookIoFailed,
  McpConfigInvalid,
  McpConfigIoFailed,
  McpDefinitionInvalid,
  McpEntryUnmanaged,
  McpOwnershipMarkerInvalid,
  McpSharedTargetConflict,
  SubagentIoFailed,
  TransientBackupFailed,
  WriteBackupRetained,
} from "@agentxm/agent-integration";

const ioCause = new Error("EACCES");

interface ConversionCase {
  readonly name: string;
  readonly failure: KnownFailure;
  readonly code: AppErrorCode;
  readonly detail: string;
  readonly title?: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  /** Expected `cause`; "self" pins the typed failure itself as the cause. */
  readonly cause?: unknown | "self";
}

const cases: ReadonlyArray<ConversionCase> = [
  {
    name: "HookConfigInvalid",
    failure: new HookConfigInvalid({
      detail: "Invalid Claude Code hooks config JSON/JSONC: /w/.claude/settings.json",
      cause: ioCause,
    }),
    code: "validation",
    detail: "Invalid Claude Code hooks config JSON/JSONC: /w/.claude/settings.json",
    cause: ioCause,
  },
  {
    name: "HookIoFailed",
    failure: new HookIoFailed({
      detail: "Failed to read Claude Code hooks config: /w/.claude/settings.json",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to read Claude Code hooks config: /w/.claude/settings.json",
    cause: ioCause,
  },
  {
    name: "TransientBackupFailed create-temp-dir",
    failure: new TransientBackupFailed({
      path: "/w/config.json",
      step: "create-temp-dir",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to create temporary directory for backup of /w/config.json",
    cause: ioCause,
  },
  {
    name: "TransientBackupFailed write-backup",
    failure: new TransientBackupFailed({
      path: "/tmp/backup/config.json.bak",
      step: "write-backup",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to write backup: /tmp/backup/config.json.bak",
    cause: ioCause,
  },
  {
    name: "TransientBackupFailed remove-backup",
    failure: new TransientBackupFailed({
      path: "/tmp/backup/config.json.bak",
      step: "remove-backup",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to remove temporary backup after successful write: /tmp/backup/config.json.bak",
    cause: ioCause,
  },
  {
    name: "SubagentIoFailed",
    failure: new SubagentIoFailed({
      detail: "Failed to materialize subagent fallback for claude-code",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to materialize subagent fallback for claude-code",
    cause: ioCause,
  },
  {
    name: "McpConfigInvalid",
    failure: new McpConfigInvalid({ detail: "Invalid MCP config YAML: /w/config.yaml" }),
    code: "validation",
    detail: "Invalid MCP config YAML: /w/config.yaml",
  },
  {
    name: "McpConfigIoFailed",
    failure: new McpConfigIoFailed({
      detail: "Failed to write MCP config: /w/.mcp.json",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to write MCP config: /w/.mcp.json",
    cause: ioCause,
  },
  {
    name: "McpEntryUnmanaged",
    failure: new McpEntryUnmanaged({ serverName: "demo", configPath: "/w/.mcp.json" }),
    code: "conflict",
    detail: "MCP server demo is unmanaged in /w/.mcp.json; AXM will not remove it",
  },
  {
    name: "McpOwnershipMarkerInvalid unsupported-version modify",
    failure: new McpOwnershipMarkerInvalid({
      serverName: "demo",
      state: "unsupported-version",
      operation: "modify",
    }),
    code: "conflict",
    detail: "MCP server demo uses a newer AXM ownership marker; upgrade AXM before modifying it",
  },
  {
    name: "McpOwnershipMarkerInvalid unsupported-version inspect",
    failure: new McpOwnershipMarkerInvalid({
      serverName: "demo",
      state: "unsupported-version",
      operation: "inspect",
    }),
    code: "conflict",
    detail: "MCP server demo uses a newer AXM ownership marker; upgrade AXM before inspecting it",
  },
  {
    name: "McpOwnershipMarkerInvalid malformed",
    failure: new McpOwnershipMarkerInvalid({
      serverName: "demo",
      state: "malformed",
      operation: "modify",
    }),
    code: "conflict",
    detail: "MCP server demo has malformed AXM ownership markers",
  },
  {
    name: "McpDefinitionInvalid",
    failure: new McpDefinitionInvalid({ detail: "Inline MCP server has no command or URL" }),
    code: "validation",
    detail: "Inline MCP server has no command or URL",
  },
  {
    name: "McpSharedTargetConflict",
    failure: new McpSharedTargetConflict({ reason: "members disagree on the shared target" }),
    code: "conflict",
    detail: "members disagree on the shared target",
  },
];

describe("agent-integration conversions", () => {
  it.each(cases.map((entry) => [entry.name, entry] as const))(
    "converts %s byte-identically",
    (_name, entry) => {
      const converted = toAppError(entry.failure);
      expect(converted).toBeInstanceOf(AppError);
      expect(converted.code).toBe(entry.code);
      expect(converted.detail).toBe(entry.detail);
      if (entry.title !== undefined) {
        expect(converted.title).toBe(entry.title);
      }
      if (entry.suggestions === undefined) {
        expect(converted.suggestions).toBeUndefined();
      } else {
        expect(converted.suggestions).toEqual(entry.suggestions);
      }
      if (entry.cause === "self") {
        expect(converted.cause).toBe(entry.failure);
      } else {
        expect(converted.cause).toEqual(entry.cause);
      }
    },
  );

  it("registers every table row as a known failure", () => {
    for (const entry of cases) {
      expect(isKnownFailure(entry.failure)).toBe(true);
    }
  });
});

describe("retained write backups", () => {
  it("re-renders a retained write backup around the inner failure", () => {
    const inner = new McpConfigIoFailed({
      detail: "Failed to write MCP config: /w/.mcp.json",
      cause: ioCause,
    });
    const retained = new WriteBackupRetained({
      backupPath: "/tmp/backup/config.json.bak",
      failure: inner,
    });
    expect(isKnownFailure(retained)).toBe(true);
    const converted = toAppError(retained);
    expect(converted.code).toBe("internal");
    expect(converted.detail).toBe(
      "Failed to write MCP config: /w/.mcp.json\nOriginal file backup retained at: /tmp/backup/config.json.bak",
    );
    expect(converted.cause).toBe(ioCause);
  });
});
