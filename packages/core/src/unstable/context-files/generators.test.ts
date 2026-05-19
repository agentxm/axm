import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { generateFileIndex, generateTableOfContents } from "./generators.js";
import { commentStyleForTarget } from "./markers.js";
import * as Option from "effect/Option";

describe("file generators", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "file-generators-"));
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
    effect.pipe(Effect.provide(NodeServices.layer));

  it("generates a markdown table of contents", () => {
    const style = commentStyleForTarget("README.md");
    if (Option.isNone(style)) return;
    const toc = generateTableOfContents(
      [
        "# Project",
        "<!-- axm:start region=toc generator=toc -->",
        "old",
        "<!-- axm:end region=toc generator=toc -->",
        "## Usage",
      ].join("\n"),
      { marker: { region: "toc", generator: "toc" }, style: style.value },
    );

    expect(toc).toBe("- [Project](#project)\n  - [Usage](#usage)");
  });

  it.effect("generates a file index list", () =>
    run(
      Effect.gen(function* () {
        nodeFs.mkdirSync(nodePath.join(tempDir, "src"), { recursive: true });
        nodeFs.writeFileSync(nodePath.join(tempDir, "README.md"), "");
        nodeFs.writeFileSync(nodePath.join(tempDir, "src", "index.ts"), "");
        nodeFs.mkdirSync(nodePath.join(tempDir, "node_modules"), { recursive: true });
        nodeFs.writeFileSync(nodePath.join(tempDir, "node_modules", "ignored.js"), "");
        nodeFs.writeFileSync(nodePath.join(tempDir, ".gitignore"), "dist/\n");
        nodeFs.mkdirSync(nodePath.join(tempDir, "dist"), { recursive: true });
        nodeFs.writeFileSync(nodePath.join(tempDir, "dist", "ignored.js"), "");

        const index = yield* generateFileIndex(tempDir, { format: "list" });

        expect(index).toContain("- README.md");
        expect(index).toContain("- src/index.ts");
        expect(index).not.toContain("node_modules");
        expect(index).not.toContain("dist");
      }),
    ),
  );

  it.effect("honors include and exclude globs", () =>
    run(
      Effect.gen(function* () {
        nodeFs.mkdirSync(nodePath.join(tempDir, "src"), { recursive: true });
        nodeFs.writeFileSync(nodePath.join(tempDir, "README.md"), "");
        nodeFs.writeFileSync(nodePath.join(tempDir, "src", "index.ts"), "");
        nodeFs.writeFileSync(nodePath.join(tempDir, "src", "index.test.ts"), "");

        const index = yield* generateFileIndex(tempDir, {
          include: ["src/**/*.ts"],
          exclude: ["*.test.ts"],
        });

        expect(index).toBe("- src/index.ts");
      }),
    ),
  );

  it.effect("extracts descriptors when requested", () =>
    run(
      Effect.gen(function* () {
        nodeFs.writeFileSync(nodePath.join(tempDir, "README.md"), "# Project\n\nBody");
        nodeFs.writeFileSync(
          nodePath.join(tempDir, "package.json"),
          JSON.stringify({ name: "sample", description: "Package descriptor" }),
        );

        const index = yield* generateFileIndex(tempDir, { descriptors: true });

        expect(index).toContain("- README.md - Project");
        expect(index).toContain("- package.json - Package descriptor");
      }),
    ),
  );

  it.effect("generates a file index tree", () =>
    run(
      Effect.gen(function* () {
        nodeFs.mkdirSync(nodePath.join(tempDir, "src", "lib"), { recursive: true });
        nodeFs.writeFileSync(nodePath.join(tempDir, "src", "lib", "util.ts"), "");

        const index = yield* generateFileIndex(tempDir, { format: "tree" });

        expect(index).toBe("    - util.ts");
      }),
    ),
  );

  it.effect("is deterministic for an unchanged snapshot", () =>
    run(
      Effect.gen(function* () {
        nodeFs.mkdirSync(nodePath.join(tempDir, "src"), { recursive: true });
        nodeFs.writeFileSync(nodePath.join(tempDir, "README.md"), "# Project\n");
        nodeFs.writeFileSync(nodePath.join(tempDir, "src", "index.ts"), "");

        const first = yield* generateFileIndex(tempDir, { descriptors: true });
        const second = yield* generateFileIndex(tempDir, { descriptors: true });

        expect(second).toBe(first);
      }),
    ),
  );
});
