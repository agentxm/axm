import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { NativeWriteAuthorityPermissive } from "../../agent-adapters/testing.js";
import type { NativeWriteAuthority } from "../../agent-adapters/index.js";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { observeInstructionProjection, removeManagedInstructionTargets } from "./instructions.js";
import {
  readInstructionRows,
  reconcileInstructions,
  stageInstructionRows,
} from "./reconciliation.js";
import { resolveNativeReferent } from "../../locations/index.js";
import {
  AcceptedResolutionWriter,
  LockfileReader,
  type ProjectionRowChange,
} from "../../workspace-state/index.js";
import { ProjectionRowsTest } from "../../workspace-state/testing.js";

const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    NodeServices.NodeServices | NativeWriteAuthority | AcceptedResolutionWriter | LockfileReader
  >,
) =>
  effect.pipe(
    Effect.provide(
      Layer.mergeAll(NativeWriteAuthorityPermissive, NodeServices.layer, ProjectionRowsTest()),
    ),
  );

/** Reconcile inside an accepted-resolution batch, as every writer's caller does. */
const reconcile = (args: Parameters<typeof reconcileInstructions>[0]) =>
  Effect.flatMap(AcceptedResolutionWriter, (writer) =>
    writer.withBatch(reconcileInstructions(args)),
  );

/** Commit row edits the way a writer's caller stages them. */
const stageRows = (changes: ReadonlyArray<ProjectionRowChange>) =>
  Effect.flatMap(AcceptedResolutionWriter, (writer) =>
    writer.withBatch(stageInstructionRows(changes)),
  );

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

            const physicalRoot = yield* resolveNativeReferent(workspaceRoot);
            const sourcePath = path.join(workspaceRoot, "AGENTS.md");
            const targetPath = path.join(physicalRoot, "CLAUDE.md");
            fs.mkdirSync(path.join(workspaceRoot, ".git"));
            fs.mkdirSync(path.join(workspaceRoot, "docs"));
            fs.writeFileSync(path.join(workspaceRoot, "docs", "AGENTS.md"), "# Docs\n");
            const config = { fileName: "AGENTS.md", gitignoreAliases: true } as const;
            const args = {
              workspaceRoot,
              scope: "project",
              configuredAgents: ["claude-code"],
              config,
              symlinkSupported: false,
            } as const;
            fs.writeFileSync(sourcePath, "# Windows workspace\n");

            const first = yield* reconcile(args);
            expect(first.written).toContain(targetPath);
            expect(fs.lstatSync(targetPath).isSymbolicLink()).toBe(false);
            expect(fs.readFileSync(targetPath, "utf8")).toContain("# Windows workspace");
            expect(fs.readFileSync(path.join(workspaceRoot, ".gitignore"), "utf8")).toContain(
              "/docs/CLAUDE.md",
            );
            expect(fs.readFileSync(path.join(workspaceRoot, ".gitignore"), "utf8")).not.toContain(
              "\\",
            );

            const unchanged = yield* reconcile(args);
            expect(unchanged.written).toEqual([]);

            fs.writeFileSync(sourcePath, "# Refreshed Windows workspace\n");
            const refreshed = yield* reconcile(args);
            expect(refreshed.written).toContain(targetPath);
            expect(fs.readFileSync(targetPath, "utf8")).toContain("# Refreshed Windows workspace");
            expect(fs.readFileSync(sourcePath, "utf8")).toBe("# Refreshed Windows workspace\n");

            const removed = yield* removeManagedInstructionTargets({
              snapshot: yield* observeInstructionProjection({
                ...args,
                rows: yield* readInstructionRows,
              }),
              dryRun: false,
            });
            expect(removed.removed).toEqual([
              targetPath,
              path.join(physicalRoot, "docs", "CLAUDE.md"),
            ]);
            yield* stageRows(removed.rowChanges);
            expect(fs.existsSync(targetPath)).toBe(false);
            expect(fs.existsSync(sourcePath)).toBe(true);

            const repeated = yield* removeManagedInstructionTargets({
              snapshot: yield* observeInstructionProjection({
                ...args,
                rows: yield* readInstructionRows,
              }),
              dryRun: false,
            });
            expect(repeated.removed).toEqual([]);
          }),
        (workspaceRoot) =>
          Effect.sync(() => fs.rmSync(workspaceRoot, { recursive: true, force: true })),
      ),
    ),
  );
});
