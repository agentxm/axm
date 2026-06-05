import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import { runFilesWorkspaceGeneratorPhase } from "./workspace-generator-phase.js";

describe("files workspace generator phase", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "files-workspace-generator-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const writeGeneratorRegion = () => {
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      agents: [],
    });
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "src", "index.ts"), "");
    fs.writeFileSync(
      path.join(tempDir, "README.md"),
      [
        "# Project",
        "<!-- axm:start region=files generator=file-index -->",
        "old",
        "<!-- axm:end region=files generator=file-index -->",
        "",
      ].join("\n"),
    );
  };

  it.effect("returns an executed plan for rendered workspace generator regions", () =>
    Effect.gen(function* () {
      const ctx = makeWorkspaceHandlerTestContext();
      writeGeneratorRegion();

      const result = yield* ctx.provide(runFilesWorkspaceGeneratorPhase({ dryRun: false }));

      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("ExecutedPlan");
        expect(result.value.name).toBe("Render workspace generator regions");
        expect(result.value.jobs[0]?.steps[0]).toMatchObject({
          label: "workspace generator regions",
          result: {
            result: "success",
            artifact: {
              scope: "project",
              change: "updated",
              fileCount: 1,
              targets: [{ path: "workspace generator regions", change: "updated" }],
            },
          },
        });
      }
      expect(fs.readFileSync(path.join(tempDir, "README.md"), "utf-8")).toContain("- src/index.ts");
    }),
  );

  it.effect("returns a previewed plan for workspace generator dry-runs without writing", () =>
    Effect.gen(function* () {
      const ctx = makeWorkspaceHandlerTestContext();
      writeGeneratorRegion();
      const readmePath = path.join(tempDir, "README.md");
      const original = fs.readFileSync(readmePath, "utf-8");

      const result = yield* ctx.provide(runFilesWorkspaceGeneratorPhase({ dryRun: true }));

      expect(fs.readFileSync(readmePath, "utf-8")).toBe(original);
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("PreviewedPlan");
        expect(result.value.name).toBe("Render workspace generator regions");
        expect(result.value.jobs[0]?.steps[0]).toMatchObject({
          label: "workspace generator regions",
          readiness: "ready",
        });
      }
    }),
  );
});
