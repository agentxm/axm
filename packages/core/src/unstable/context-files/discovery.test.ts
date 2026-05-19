import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { contextFilesPackagesInDir } from "./discovery.js";

describe("contextFilesPackagesInDir", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "file-discovery-"));
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
    effect.pipe(Effect.provide(NodeServices.layer));

  const writeContextFilesPackage = (dir: string, name: string) => {
    nodeFs.mkdirSync(nodePath.join(dir, "src"), { recursive: true });
    nodeFs.writeFileSync(
      nodePath.join(dir, "context-files.json"),
      JSON.stringify({
        owner: "@acme",
        type: "file",
        name,
        version: "1.0.0",
        contents: [
          {
            source: { kind: "static", path: "README.md" },
            target: "README.md",
            mode: "sync-once",
          },
        ],
      }),
    );
  };

  it.effect("discovers direct context files packages", () =>
    run(
      Effect.gen(function* () {
        writeContextFilesPackage(tempDir, "workspace-baseline");

        const discovered = yield* contextFilesPackagesInDir(tempDir, { fullDepth: false });

        expect(discovered.map((pkg) => pkg.manifest.name)).toEqual(["workspace-baseline"]);
      }),
    ),
  );

  it.effect("discovers child context files packages", () =>
    run(
      Effect.gen(function* () {
        writeContextFilesPackage(nodePath.join(tempDir, "packages", "baseline"), "baseline");

        const discovered = yield* contextFilesPackagesInDir(tempDir, { fullDepth: true });

        expect(discovered.map((pkg) => pkg.manifest.name)).toEqual(["baseline"]);
      }),
    ),
  );
});
