import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { reconcileInstructionTargets, removeManagedInstructionTargets } from "./instructions.js";

const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

describe("Windows instruction-file materialization", () => {
  it.effect("creates, refreshes, and removes the managed-copy fallback idempotently", () =>
    run(
      Effect.acquireUseRelease(
        Effect.sync(() => fs.mkdtempSync(path.join(os.tmpdir(), "axm windows instructions "))),
        (workspaceRoot) =>
          Effect.gen(function* () {
            expect(process.platform).toBe("win32");
            expect(path.sep).toBe("\\");
            expect(path.parse(workspaceRoot).root).toMatch(/^[A-Za-z]:\\$/u);

            const sourcePath = path.join(workspaceRoot, "AGENTS.md");
            const targetPath = path.join(workspaceRoot, "CLAUDE.md");
            const config = { fileName: "AGENTS.md", gitignoreAliases: false } as const;
            fs.writeFileSync(sourcePath, "# Windows workspace\n");

            const first = yield* reconcileInstructionTargets({
              workspaceRoot,
              scope: "project",
              configuredAgents: ["claude-code"],
              config,
              symlinkSupported: false,
            });
            expect(first.written).toContain(targetPath);
            expect(fs.lstatSync(targetPath).isSymbolicLink()).toBe(false);
            expect(fs.readFileSync(targetPath, "utf8")).toContain("# Windows workspace");

            const unchanged = yield* reconcileInstructionTargets({
              workspaceRoot,
              scope: "project",
              configuredAgents: ["claude-code"],
              config,
              symlinkSupported: false,
            });
            expect(unchanged.written).toEqual([]);

            fs.writeFileSync(sourcePath, "# Refreshed Windows workspace\n");
            const refreshed = yield* reconcileInstructionTargets({
              workspaceRoot,
              scope: "project",
              configuredAgents: ["claude-code"],
              config,
              symlinkSupported: false,
            });
            expect(refreshed.written).toContain(targetPath);
            expect(fs.readFileSync(targetPath, "utf8")).toContain("# Refreshed Windows workspace");
            expect(fs.readFileSync(sourcePath, "utf8")).toBe("# Refreshed Windows workspace\n");

            const removed = yield* removeManagedInstructionTargets({
              workspaceRoot,
              scope: "project",
              configuredAgents: ["claude-code"],
              config,
              dryRun: false,
              symlinkSupported: false,
            });
            expect(removed).toEqual([targetPath]);
            expect(fs.existsSync(targetPath)).toBe(false);
            expect(fs.existsSync(sourcePath)).toBe(true);

            const repeated = yield* removeManagedInstructionTargets({
              workspaceRoot,
              scope: "project",
              configuredAgents: ["claude-code"],
              config,
              dryRun: false,
              symlinkSupported: false,
            });
            expect(repeated).toEqual([]);
          }),
        (workspaceRoot) =>
          Effect.sync(() => fs.rmSync(workspaceRoot, { recursive: true, force: true })),
      ),
    ),
  );
});
