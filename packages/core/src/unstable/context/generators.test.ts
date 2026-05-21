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

  it.effect("renders path, title, and description columns in a list", () =>
    run(
      Effect.gen(function* () {
        nodeFs.writeFileSync(nodePath.join(tempDir, "README.md"), "# Project\n\nBody");
        nodeFs.writeFileSync(
          nodePath.join(tempDir, "package.json"),
          JSON.stringify({ name: "sample", description: "Package descriptor" }),
        );

        const index = yield* generateFileIndex(tempDir, {
          columns: ["path", "title", "description"],
        });

        expect(index).toContain("- README.md - Project");
        expect(index).toContain("- package.json - sample - Package descriptor");
      }),
    ),
  );

  it.effect("renders a markdown table with selected columns", () =>
    run(
      Effect.gen(function* () {
        nodeFs.mkdirSync(nodePath.join(tempDir, "docs"), { recursive: true });
        nodeFs.writeFileSync(
          nodePath.join(tempDir, "docs", "operations.md"),
          "---\ntitle: Operations\ndescription: dotnet commands\n---\n# heading\n",
        );
        nodeFs.writeFileSync(nodePath.join(tempDir, "docs", "axm.md"), "# AXM Extensions\n");

        const index = yield* generateFileIndex(tempDir, {
          include: ["docs/*.md"],
          format: "table",
          columns: ["fileName", "title", "description"],
        });

        expect(index).toBe(
          [
            "| File | Title | Description |",
            "| --- | --- | --- |",
            "| axm.md | AXM Extensions |  |",
            "| operations.md | Operations | dotnet commands |",
          ].join("\n"),
        );
      }),
    ),
  );

  it.effect("renders link column as a markdown link", () =>
    run(
      Effect.gen(function* () {
        nodeFs.mkdirSync(nodePath.join(tempDir, "docs"), { recursive: true });
        nodeFs.writeFileSync(nodePath.join(tempDir, "docs", "guide.md"), "# Guide\n");

        const index = yield* generateFileIndex(tempDir, {
          include: ["docs/*.md"],
          format: "table",
          columns: ["link", "title"],
        });

        expect(index).toContain("| [guide.md](docs/guide.md) | Guide |");
      }),
    ),
  );

  it.effect("title prefers frontmatter title over first heading", () =>
    run(
      Effect.gen(function* () {
        nodeFs.writeFileSync(
          nodePath.join(tempDir, "doc.md"),
          "---\ntitle: Frontmatter wins\n---\n\n# Heading title\n\nBody",
        );

        const index = yield* generateFileIndex(tempDir, { columns: ["path", "title"] });

        expect(index).toContain("- doc.md - Frontmatter wins");
      }),
    ),
  );

  it.effect("title falls back to first heading when frontmatter has no title", () =>
    run(
      Effect.gen(function* () {
        nodeFs.writeFileSync(
          nodePath.join(tempDir, "doc.md"),
          "---\nauthor: alice\n---\n\n# Heading title\n\nBody",
        );

        const index = yield* generateFileIndex(tempDir, { columns: ["path", "title"] });

        expect(index).toContain("- doc.md - Heading title");
      }),
    ),
  );

  it.effect("description ignores headings and reads frontmatter description/summary", () =>
    run(
      Effect.gen(function* () {
        nodeFs.writeFileSync(
          nodePath.join(tempDir, "with-desc.md"),
          "---\ndescription: From frontmatter\n---\n# Heading title\n",
        );
        nodeFs.writeFileSync(nodePath.join(tempDir, "no-desc.md"), "# Just a heading\n");

        const index = yield* generateFileIndex(tempDir, {
          format: "table",
          columns: ["path", "description"],
        });

        expect(index).toContain("| with-desc.md | From frontmatter |");
        expect(index).toContain("| no-desc.md |  |");
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

        const first = yield* generateFileIndex(tempDir, { columns: ["path", "description"] });
        const second = yield* generateFileIndex(tempDir, { columns: ["path", "description"] });

        expect(second).toBe(first);
      }),
    ),
  );
});
