import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { hookPackagesInDir } from "./hook-package-discovery.js";

describe("hookPackagesInDir", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "hook-discovery-"));
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
    effect.pipe(Effect.provide(NodeServices.layer));

  const writeHookPackage = (dir: string, name: string) => {
    nodeFs.mkdirSync(nodePath.join(dir, "src"), { recursive: true });
    nodeFs.writeFileSync(
      nodePath.join(dir, "hook.json"),
      JSON.stringify({
        owner: "@acme",
        type: "hook",
        name,
        version: "1.0.0",
        runtime: "bash",
        entrypoint: "src/hook.sh",
        bindings: [{ on: "tool.pre" }],
      }),
    );
  };

  it.effect("discovers direct hook packages", () =>
    run(
      Effect.gen(function* () {
        writeHookPackage(tempDir, "tool-audit");

        const discovered = yield* hookPackagesInDir(tempDir, { fullDepth: false });

        expect(discovered.map((pkg) => pkg.manifest.name)).toEqual(["tool-audit"]);
      }),
    ),
  );

  it.effect("discovers child hook packages", () =>
    run(
      Effect.gen(function* () {
        writeHookPackage(nodePath.join(tempDir, "packages", "tool-audit"), "tool-audit");

        const discovered = yield* hookPackagesInDir(tempDir, { fullDepth: true });

        expect(discovered.map((pkg) => pkg.manifest.name)).toEqual(["tool-audit"]);
      }),
    ),
  );
});
