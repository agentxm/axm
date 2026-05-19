import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { renderWorkspaceGeneratorRegions } from "./workspace-generators.js";

describe("workspace generator regions", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "workspace-generators-"));
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
    effect.pipe(Effect.provide(NodeServices.layer));

  it.effect("renders inline file-index regions and respects scan exclusions", () =>
    run(
      Effect.gen(function* () {
        nodeFs.writeFileSync(nodePath.join(tempDir, ".gitignore"), "dist/\n");
        nodeFs.mkdirSync(nodePath.join(tempDir, "src"), { recursive: true });
        nodeFs.mkdirSync(nodePath.join(tempDir, "dist"), { recursive: true });
        nodeFs.mkdirSync(nodePath.join(tempDir, ".axm", "extensions"), { recursive: true });
        nodeFs.writeFileSync(nodePath.join(tempDir, "src", "index.ts"), "");
        nodeFs.writeFileSync(nodePath.join(tempDir, "dist", "ignored.js"), "");
        nodeFs.writeFileSync(nodePath.join(tempDir, ".axm", "extensions", "ignored.md"), "");
        const readmePath = nodePath.join(tempDir, "README.md");
        nodeFs.writeFileSync(
          readmePath,
          [
            "# Project",
            "<!-- axm:start region=files generator=file-index -->",
            "old",
            "<!-- axm:end region=files generator=file-index -->",
            "",
          ].join("\n"),
        );

        const result = yield* renderWorkspaceGeneratorRegions({ workspaceRoot: tempDir });

        const readme = nodeFs.readFileSync(readmePath, "utf-8");
        expect(result.renderedRegions).toBe(1);
        expect(result.changedFiles).toBe(1);
        expect(readme).toContain("- README.md");
        expect(readme).toContain("- src/index.ts");
        expect(readme).not.toContain("dist");
        expect(readme).not.toContain(".axm/extensions");
      }),
    ),
  );

  it.effect("renders inline toc regions without listing its own region", () =>
    run(
      Effect.gen(function* () {
        const readmePath = nodePath.join(tempDir, "README.md");
        nodeFs.writeFileSync(
          readmePath,
          [
            "# Project",
            "<!-- axm:start region=toc generator=toc -->",
            "- old",
            "<!-- axm:end region=toc generator=toc -->",
            "## Usage",
            "",
          ].join("\n"),
        );

        yield* renderWorkspaceGeneratorRegions({ workspaceRoot: tempDir });

        const readme = nodeFs.readFileSync(readmePath, "utf-8");
        expect(readme).toContain("- [Project](#project)");
        expect(readme).toContain("  - [Usage](#usage)");
        expect(readme).not.toContain("- old");
      }),
    ),
  );

  it.effect("dry-run reports changes without writing files", () =>
    run(
      Effect.gen(function* () {
        const readmePath = nodePath.join(tempDir, "README.md");
        const original = [
          "# Project",
          "<!-- axm:start region=files generator=file-index -->",
          "old",
          "<!-- axm:end region=files generator=file-index -->",
          "",
        ].join("\n");
        nodeFs.writeFileSync(readmePath, original);

        const result = yield* renderWorkspaceGeneratorRegions({
          workspaceRoot: tempDir,
          dryRun: true,
        });

        expect(result.changedFiles).toBe(1);
        expect(nodeFs.readFileSync(readmePath, "utf-8")).toBe(original);
      }),
    ),
  );
});
