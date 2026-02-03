/**
 * Tests for workspace initialization state module.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as os from "node:os";
import * as nodePath from "node:path";
import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentConfig } from "../skills/types.js";
import { buildIdealInitState, loadActualInitState } from "./state.js";

// Test helpers
const runEffect = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeContext.layer)));

describe("loadActualInitState", () => {
  let tempDir: string;
  let axmDir: string;

  beforeEach(async () => {
    tempDir = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmpBase = os.tmpdir();
        const dir = nodePath.join(tmpBase, `axm-init-test-${Date.now()}`);
        yield* fs.makeDirectory(dir, { recursive: true });
        return dir;
      }),
    );
    axmDir = nodePath.join(tempDir, ".axm");
  });

  afterEach(async () => {
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove(tempDir, { recursive: true });
      }),
    );
  });

  it("returns NotInitialized when settings.json does not exist", async () => {
    const result = await runEffect(loadActualInitState(axmDir));

    expect(result.validity._tag).toBe("NotInitialized");
  });

  it("returns NotInitialized when .axm directory does not exist", async () => {
    const nonExistentDir = nodePath.join(tempDir, "non-existent", ".axm");
    const result = await runEffect(loadActualInitState(nonExistentDir));

    expect(result.validity._tag).toBe("NotInitialized");
  });

  it("returns Valid with settings when settings.json exists and is valid", async () => {
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(axmDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(axmDir, "settings.json"),
          JSON.stringify({
            scope: "@myorg",
            agents: ["claude-code", "cursor"],
          }),
        );
      }),
    );

    const result = await runEffect(loadActualInitState(axmDir));

    expect(result.validity._tag).toBe("Valid");
    if (result.validity._tag === "Valid") {
      expect(result.validity.settings.scope).toBe("@myorg");
      expect(result.validity.settings.agents).toEqual(["claude-code", "cursor"]);
    }
  });

  it("returns Valid with empty settings when settings.json is empty object", async () => {
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(axmDir, { recursive: true });
        yield* fs.writeFileString(nodePath.join(axmDir, "settings.json"), "{}");
      }),
    );

    const result = await runEffect(loadActualInitState(axmDir));

    expect(result.validity._tag).toBe("Valid");
    if (result.validity._tag === "Valid") {
      expect(result.validity.settings).toEqual({});
    }
  });

  it("returns Invalid when settings.json contains invalid JSON", async () => {
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(axmDir, { recursive: true });
        yield* fs.writeFileString(nodePath.join(axmDir, "settings.json"), "{ invalid json }");
      }),
    );

    const result = await runEffect(loadActualInitState(axmDir));

    expect(result.validity._tag).toBe("Invalid");
    if (result.validity._tag === "Invalid") {
      expect(result.validity.error).toContain("parse");
    }
  });

  it("returns Invalid when settings.json fails schema validation", async () => {
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(axmDir, { recursive: true });
        // Invalid: agents should be an array of strings, not numbers
        yield* fs.writeFileString(
          nodePath.join(axmDir, "settings.json"),
          JSON.stringify({ agents: [123, 456] }),
        );
      }),
    );

    const result = await runEffect(loadActualInitState(axmDir));

    expect(result.validity._tag).toBe("Invalid");
  });
});

describe("buildIdealInitState", () => {
  it("uses detected agents", () => {
    const agents: AgentConfig[] = [
      { id: "claude-code", name: "Claude Code", detectPath: "~/.claude" },
      { id: "cursor", name: "Cursor", detectPath: "~/.cursor" },
    ];

    const result = buildIdealInitState(agents);

    expect(result.agents).toEqual(agents);
    expect(result.agents.length).toBe(2);
  });

  it("uses @community as default scope", () => {
    const agents: AgentConfig[] = [
      { id: "claude-code", name: "Claude Code", detectPath: "~/.claude" },
    ];

    const result = buildIdealInitState(agents);

    expect(result.scope).toBe("@community");
  });

  it("accepts custom scope", () => {
    const agents: AgentConfig[] = [
      { id: "claude-code", name: "Claude Code", detectPath: "~/.claude" },
    ];

    const result = buildIdealInitState(agents, "@myorg");

    expect(result.scope).toBe("@myorg");
  });

  it("handles empty agents list", () => {
    const result = buildIdealInitState([]);

    expect(result.agents).toEqual([]);
    expect(result.scope).toBe("@community");
  });

  it("preserves agent ordering", () => {
    const agents: AgentConfig[] = [
      { id: "cursor", name: "Cursor", detectPath: "~/.cursor" },
      { id: "claude-code", name: "Claude Code", detectPath: "~/.claude" },
      { id: "windsurf", name: "Windsurf", detectPath: "~/.windsurf" },
    ];

    const result = buildIdealInitState(agents);

    expect(result.agents.map((a) => a.id)).toEqual(["cursor", "claude-code", "windsurf"]);
  });
});
