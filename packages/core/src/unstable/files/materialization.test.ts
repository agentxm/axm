import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { FileContentsEntrySchema, type FileContentsEntry } from "./manifest-schema.js";
import { materializeFileEntry, renderFileContent, renderFileTemplate } from "./materialization.js";

const decodeEntry = Schema.decodeUnknownSync(FileContentsEntrySchema);

describe("file materialization", () => {
  let tempDir: string;
  let packageRoot: string;
  let workspaceRoot: string;

  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "file-materialization-"));
    packageRoot = nodePath.join(tempDir, "package");
    workspaceRoot = nodePath.join(tempDir, "workspace");
    nodeFs.mkdirSync(nodePath.join(packageRoot, "src"), { recursive: true });
    nodeFs.mkdirSync(workspaceRoot, { recursive: true });
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
    effect.pipe(Effect.provide(NodeServices.layer));

  const files = () => ({
    inputs: { projectName: "AgentXM", strict: true },
    vars: { packageManager: "pnpm" },
    workspace: { root: workspaceRoot },
  });

  it.effect("renders static sources in ordered list order", () =>
    run(
      Effect.gen(function* () {
        nodeFs.writeFileSync(nodePath.join(packageRoot, "src", "a.txt"), "A");
        nodeFs.writeFileSync(nodePath.join(packageRoot, "src", "b.txt"), "B");

        const content = yield* renderFileContent({
          packageRoot,
          templateFiles: files(),
          source: { kind: "static", path: ["a.txt", "b.txt"] },
        });

        expect(content).toBe("AB");
      }),
    ),
  );

  it.effect("renders scalar template substitutions", () =>
    run(
      Effect.gen(function* () {
        const rendered = yield* renderFileTemplate(
          "name=${inputs.projectName}\nstrict=${inputs.strict}\npm=${vars.packageManager}\nroot=${workspace.root}\n",
          files(),
        );

        expect(rendered).toContain("name=AgentXM");
        expect(rendered).toContain("strict=true");
        expect(rendered).toContain("pm=pnpm");
        expect(rendered).toContain(`root=${workspaceRoot}`);
      }),
    ),
  );

  it.effect("rejects payload paths that escape src", () =>
    run(
      Effect.gen(function* () {
        const result = yield* Effect.result(
          renderFileContent({
            packageRoot,
            templateFiles: files(),
            source: { kind: "static", path: "../secret.txt" },
          }),
        );

        expect(result._tag).toBe("Failure");
      }),
    ),
  );

  it.effect("renders generated file indexes from the workspace", () =>
    run(
      Effect.gen(function* () {
        nodeFs.mkdirSync(nodePath.join(workspaceRoot, "src"), { recursive: true });
        nodeFs.writeFileSync(nodePath.join(workspaceRoot, "README.md"), "# Project\n");
        nodeFs.writeFileSync(nodePath.join(workspaceRoot, "src", "index.ts"), "");

        const content = yield* renderFileContent({
          packageRoot,
          templateFiles: files(),
          source: {
            kind: "generated",
            generator: {
              name: "file-index",
              options: { include: "src/**/*.ts", columns: "path,description" },
            },
          },
        });

        expect(content).toBe("- src/index.ts");
      }),
    ),
  );

  it.effect("renders generated tables of contents from workspace markdown", () =>
    run(
      Effect.gen(function* () {
        nodeFs.writeFileSync(
          nodePath.join(workspaceRoot, "README.md"),
          [
            "# Project",
            "<!-- axm:start region=toc generator=toc -->",
            "old",
            "<!-- axm:end region=toc generator=toc -->",
            "## Usage",
          ].join("\n"),
        );

        const content = yield* renderFileContent({
          packageRoot,
          templateFiles: files(),
          source: {
            kind: "generated",
            generator: {
              name: "toc",
              options: { source: "README.md", region: "toc" },
            },
          },
        });

        expect(content).toBe("- [Project](#project)\n  - [Usage](#usage)");
      }),
    ),
  );

  it.effect("defaults generated tables of contents to the materialization target", () =>
    run(
      Effect.gen(function* () {
        nodeFs.writeFileSync(
          nodePath.join(workspaceRoot, "README.md"),
          [
            "# Project",
            "<!-- axm:start region=toc ext=@acme/files/files -->",
            "old",
            "<!-- axm:end region=toc ext=@acme/files/files -->",
            "## Usage",
          ].join("\n"),
        );

        const content = yield* renderFileContent({
          packageRoot,
          templateFiles: files(),
          source: {
            kind: "generated",
            generator: {
              name: "toc",
            },
          },
          generatedFiles: {
            target: "README.md",
            ownRegion: {
              region: "toc",
              ext: "@acme/files/files",
            },
          },
        });

        expect(content).toBe("- [Project](#project)\n  - [Usage](#usage)");
      }),
    ),
  );

  it.effect("writes sync-once only when the target is absent", () =>
    run(
      Effect.gen(function* () {
        nodeFs.writeFileSync(nodePath.join(packageRoot, "src", "README.md"), "generated");
        const entry = decodeEntry({
          source: { kind: "static", path: "README.md" },
          target: "README.md",
          mode: "sync-once",
        });

        const first = yield* materializeFileEntry({
          packageRoot,
          workspaceRoot,
          entry,
          templateFiles: files(),
        });
        nodeFs.writeFileSync(nodePath.join(workspaceRoot, "README.md"), "user edit");
        const second = yield* materializeFileEntry({
          packageRoot,
          workspaceRoot,
          entry,
          templateFiles: files(),
        });

        expect(first.written).toBe(true);
        expect(second.written).toBe(false);
        expect(second.reason).toBe("preserved");
        expect(nodeFs.readFileSync(nodePath.join(workspaceRoot, "README.md"), "utf-8")).toBe(
          "user edit",
        );
      }),
    ),
  );

  it.effect("skips sync-always when the target content is unchanged", () =>
    run(
      Effect.gen(function* () {
        nodeFs.writeFileSync(nodePath.join(packageRoot, "src", ".editorconfig"), "root = true\n");
        const entry: FileContentsEntry = decodeEntry({
          source: { kind: "static", path: ".editorconfig" },
          target: ".editorconfig",
          mode: "sync-always",
        });

        const first = yield* materializeFileEntry({
          packageRoot,
          workspaceRoot,
          entry,
          templateFiles: files(),
        });
        const second = yield* materializeFileEntry({
          packageRoot,
          workspaceRoot,
          entry,
          templateFiles: files(),
        });

        expect(first.written).toBe(true);
        expect(second.written).toBe(false);
        expect(second.reason).toBe("unchanged");
        expect(nodeFs.readFileSync(nodePath.join(workspaceRoot, ".editorconfig"), "utf-8")).toBe(
          "root = true\n",
        );
      }),
    ),
  );
});
