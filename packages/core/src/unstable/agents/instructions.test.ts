import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import {
  getInstructionsStatus,
  normalizeMarkdownBody,
  resolveInstructionMechanism,
  syncInstructions,
} from "./instructions.js";

describe("agent instructions", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-instructions-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
    effect.pipe(Effect.provide(NodeServices.layer));

  it("normalizes markdown bodies without frontmatter or trailing whitespace", () => {
    expect(normalizeMarkdownBody("---\ntitle: Local\n---\n\n# Rules  \r\n")).toBe("# Rules");
    expect(normalizeMarkdownBody("# Rules\n")).toBe("# Rules");
  });

  it("resolves own-file fallback mechanisms", () => {
    expect(
      resolveInstructionMechanism(
        { kind: "own-file", file: "CLAUDE.md", importSyntax: "at-path" },
        false,
      ),
    ).toBe("pointer");
    expect(resolveInstructionMechanism({ kind: "own-file", file: "GEMINI.md" }, false)).toBe(
      "copy",
    );
  });

  it.effect("syncs configured own-file agents from AGENTS.md", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

        const result = yield* syncInstructions({
          workspaceRoot: tempDir,
          configuredAgents: ["claude-code", "gemini-cli", "codex"],
          config: { fileName: "AGENTS.md", gitignore: "managed" },
          force: false,
          dryRun: false,
        });

        expect(result.written).toEqual(
          expect.arrayContaining([
            path.join(tempDir, "CLAUDE.md"),
            path.join(tempDir, "GEMINI.md"),
            path.join(tempDir, ".gitignore"),
          ]),
        );
        expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8")).toBe("# Workspace\n");
        expect(fs.readFileSync(path.join(tempDir, "GEMINI.md"), "utf-8")).toBe("# Workspace\n");
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).toContain(
          "**/CLAUDE.md",
        );
      }),
    ),
  );

  it.effect("reports copy drift without overwriting it", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        fs.writeFileSync(path.join(tempDir, "GEMINI.md"), "# Local edit\n");

        yield* syncInstructions({
          workspaceRoot: tempDir,
          configuredAgents: ["gemini-cli"],
          config: { fileName: "AGENTS.md", gitignore: "off" },
          force: false,
          dryRun: false,
        });
        const status = yield* getInstructionsStatus({
          workspaceRoot: tempDir,
          configuredAgents: ["gemini-cli"],
          config: { fileName: "AGENTS.md", gitignore: "off" },
        });

        expect(fs.readFileSync(path.join(tempDir, "GEMINI.md"), "utf-8")).toBe("# Local edit\n");
        expect(status.items[0]?.health).toBe("drift");
      }),
    ),
  );
});
