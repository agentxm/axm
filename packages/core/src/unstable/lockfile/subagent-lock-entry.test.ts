/**
 * Unit tests for SubagentLockEntry schema validation and lockfile integration.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { SubagentLockEntrySchema, LockfileSchema, type Lockfile } from "./schema.js";
import { writeLockfile } from "./lockfile.js";

describe("SubagentLockEntry schema", () => {
  const decode = Schema.decodeUnknownSync(SubagentLockEntrySchema);
  const encode = Schema.encodeUnknownSync(SubagentLockEntrySchema);

  it("drops legacy agents from a valid local subagent lock entry", () => {
    const input = {
      type: "local",
      path: "./subagents/planner",
      agents: ["claude-code", "cursor"],
      installedAt: "2025-01-15T10:30:00Z",
      updatedAt: "2025-01-15T10:30:00Z",
    };
    const result = decode(input);
    expect(result.type).toBe("local");
    expect(result).not.toHaveProperty("agents");
  });

  it("preserves sourceHash and drops legacy renderedFiles", () => {
    const input = {
      type: "local",
      path: "./subagents/planner",
      agents: ["claude-code"],
      installedAt: "2025-01-15T10:30:00Z",
      updatedAt: "2025-01-15T10:30:00Z",
      sourceHash: "abc123def456",
      renderedFiles: {
        "claude-code": [{ path: ".claude/agents/planner.md" }],
      },
    };
    const result = decode(input);
    expect(result.sourceHash).toBe("abc123def456");
    expect(result).not.toHaveProperty("renderedFiles");
  });

  it("accepts subagent lock entry without optional sourceHash and renderedFiles", () => {
    const input = {
      type: "github",
      owner: "acme",
      repo: "subagents",
      agents: ["claude-code"],
      installedAt: "2025-01-15T10:30:00Z",
      updatedAt: "2025-01-15T10:30:00Z",
    };
    const result = decode(input);
    expect(result.sourceHash).toBeUndefined();
    expect(result).not.toHaveProperty("renderedFiles");
  });

  it("roundtrips subagent lock entry with all fields", () => {
    const input = {
      type: "local",
      path: "./subagents/planner",
      agents: ["claude-code"],
      installedAt: "2025-01-15T10:30:00.000Z",
      updatedAt: "2025-01-15T10:30:00.000Z",
      sourceHash: "abc123",
      renderedFiles: {
        "claude-code": [{ path: ".claude/agents/planner.md" }],
      },
    };
    const decoded = decode(input);
    const encoded = encode(decoded);
    expect(encoded).toEqual({
      type: "local",
      path: "./subagents/planner",
      installedAt: "2025-01-15T10:30:00.000Z",
      updatedAt: "2025-01-15T10:30:00.000Z",
      sourceHash: "abc123",
    });
  });

  it("accepts subagent lock entry without agents", () => {
    const input = {
      type: "local",
      path: "./subagents/planner",
      installedAt: "2025-01-15T10:30:00Z",
      updatedAt: "2025-01-15T10:30:00Z",
    };
    expect(decode(input).type).toBe("local");
  });

  it("accepts valid GitHub lock entry", () => {
    const input = {
      type: "github",
      owner: "acme",
      repo: "subagents",
      ref: "main",
      path: "subagents/planner",
      agents: ["claude-code"],
      installedAt: "2025-01-15T10:30:00Z",
      updatedAt: "2025-01-15T10:30:00Z",
    };
    const result = decode(input);
    expect(result.type).toBe("github");
    if (result.type === "github") {
      expect(result.owner).toBe("acme");
      expect(result.repo).toBe("subagents");
    }
  });

  it("accepts valid registry lock entry", () => {
    const input = {
      type: "registry",
      owner: "@acme",
      name: "planner",
      resolvedVersion: "1.0.0",
      integrity: "sha512-abc123",
      sourceName: "default",
      agents: ["claude-code"],
      installedAt: "2025-01-15T10:30:00Z",
      updatedAt: "2025-01-15T10:30:00Z",
    };
    const result = decode(input);
    expect(result.type).toBe("registry");
    if (result.type === "registry") {
      expect(result.owner).toBe("@acme");
      expect(result.name).toBe("planner");
    }
  });

  it("rejects registry lock entry with range resolvedVersion", () => {
    const input = {
      type: "registry",
      owner: "@acme",
      name: "planner",
      resolvedVersion: "^1.0.0",
      integrity: "sha512-abc123",
      sourceName: "default",
      agents: ["claude-code"],
      installedAt: "2025-01-15T10:30:00Z",
      updatedAt: "2025-01-15T10:30:00Z",
    };
    expect(() => decode(input)).toThrow();
  });
});

describe("Lockfile with subagents", () => {
  it("accepts lockfile with subagents section", () => {
    const input = {
      lockfileVersion: 1,
      skills: {},
      subagents: {
        planner: {
          type: "local",
          path: "./subagents/planner",
          agents: ["claude-code"],
          installedAt: "2025-01-15T10:30:00Z",
          updatedAt: "2025-01-15T10:30:00Z",
          sourceHash: "abc123",
          renderedFiles: {
            "claude-code": [{ path: ".claude/agents/planner.md" }],
          },
        },
      },
    };

    const result = Schema.decodeUnknownSync(LockfileSchema)(input);

    expect(result.subagents).toBeDefined();
    const planner = result.subagents?.["planner"];
    expect(planner?.type).toBe("local");
    expect(planner?.sourceHash).toBe("abc123");
    expect(planner).not.toHaveProperty("agents");
    expect(planner).not.toHaveProperty("renderedFiles");
  });

  it("accepts lockfile without subagents section", () => {
    const input = {
      lockfileVersion: 1,
      skills: {},
    };

    const result = Schema.decodeUnknownSync(LockfileSchema)(input);

    expect(result.subagents).toBeUndefined();
  });

  it("accepts lockfile with multiple subagents", () => {
    const input = {
      lockfileVersion: 1,
      skills: {},
      subagents: {
        planner: {
          type: "local",
          path: "./subagents/planner",
          agents: ["claude-code"],
          installedAt: "2025-01-15T10:30:00Z",
          updatedAt: "2025-01-15T10:30:00Z",
        },
        reviewer: {
          type: "github",
          owner: "acme",
          repo: "subagents",
          agents: ["cursor"],
          installedAt: "2025-01-15T11:00:00Z",
          updatedAt: "2025-01-15T11:00:00Z",
        },
      },
    };

    const result = Schema.decodeUnknownSync(LockfileSchema)(input);

    expect(Object.keys(result.subagents ?? {})).toHaveLength(2);
  });
});

describe("lockfile subagent round-trip", () => {
  let tempDir: string;
  let axmDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lockfile-subagent-test-"));
    axmDir = path.join(tempDir, ".axm");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const withContext = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
    effect.pipe(Effect.provide(NodeServices.layer));

  it.effect("preserves subagent fields through read/write cycle", () =>
    withContext(
      Effect.gen(function* () {
        const lockfile: Lockfile = {
          lockfileVersion: 1,
          skills: {},
          subagents: {
            planner: {
              type: "github",
              owner: "acme",
              repo: "subagents",
              ref: "main",
              path: "subagents/planner",
              installedAt: new Date("2025-01-15T10:30:00.000Z"),
              updatedAt: new Date("2025-01-15T10:30:00.000Z"),
              sourceHash: "abc123",
            },
          },
        };

        yield* writeLockfile(axmDir, lockfile);
        const result = Schema.decodeUnknownSync(LockfileSchema)(
          YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8")),
        );

        expect(result.subagents).toBeDefined();
        const planner = result.subagents?.["planner"];
        expect(planner?.type).toBe("github");
        if (planner?.type === "github") {
          expect(planner.owner).toBe("acme");
          expect(planner.repo).toBe("subagents");
          expect(planner.ref).toBe("main");
        }
        expect(planner?.sourceHash).toBe("abc123");
        expect(planner).not.toHaveProperty("agents");
        expect(planner).not.toHaveProperty("renderedFiles");
      }),
    ),
  );

  it("decodes lockfile with subagents from YAML", () => {
    fs.mkdirSync(axmDir, { recursive: true });
    const lockfileContent = YAML.stringify({
      lockfileVersion: 1,
      skills: {},
      subagents: {
        planner: {
          type: "local",
          path: "./subagents/planner",
          agents: ["claude-code"],
          installedAt: "2025-01-15T10:30:00.000Z",
          updatedAt: "2025-01-15T10:30:00.000Z",
        },
      },
    });
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), lockfileContent);

    const result = Schema.decodeUnknownSync(LockfileSchema)(YAML.parse(lockfileContent));

    expect(result.subagents?.["planner"]).toBeDefined();
    expect(result.subagents?.["planner"]?.type).toBe("local");
  });
});
