import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { rulePackagesInDir } from "./discovery.js";

describe("rulePackagesInDir", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "rule-discovery-"));
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
    effect.pipe(Effect.provide(NodeServices.layer));

  const writeRulePackage = (dir: string, name: string) => {
    nodeFs.mkdirSync(nodePath.join(dir, "src"), { recursive: true });
    nodeFs.writeFileSync(
      nodePath.join(dir, "rule.json"),
      JSON.stringify({
        owner: "@acme",
        type: "rule",
        name,
        version: "1.0.0",
      }),
    );
  };

  it.effect("discovers direct rule packages", () =>
    run(
      Effect.gen(function* () {
        writeRulePackage(tempDir, "typescript-style");

        const discovered = yield* rulePackagesInDir(tempDir, { fullDepth: false });

        expect(discovered.map((pkg) => pkg.manifest.name)).toEqual(["typescript-style"]);
      }),
    ),
  );

  it.effect("discovers child rule packages", () =>
    run(
      Effect.gen(function* () {
        writeRulePackage(nodePath.join(tempDir, "packages", "style"), "typescript-style");

        const discovered = yield* rulePackagesInDir(tempDir, { fullDepth: true });

        expect(discovered.map((pkg) => pkg.manifest.name)).toEqual(["typescript-style"]);
      }),
    ),
  );
});
