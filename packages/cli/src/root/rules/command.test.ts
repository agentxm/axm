import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { layer as coreWorkspaceLayer } from "@agentxm/client-core/unstable/workspace";
import { handleRulesEnable } from "./command.js";

const initWorkspace = (baseDir: string, agents: ReadonlyArray<string>) => {
  const axmDir = path.join(baseDir, ".axm");
  fs.mkdirSync(axmDir, { recursive: true });
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify({ agents }, null, 2));
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");
};

describe("rules handler", () => {
  let tempDir: string;
  let homeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rules-handler-"));
    homeDir = path.join(tempDir, "home");
    fs.mkdirSync(homeDir, { recursive: true });
    process.chdir(tempDir);
    process.env["HOME"] = homeDir;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome === undefined) {
      delete process.env["HOME"];
    } else {
      process.env["HOME"] = originalHome;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeProvide = () => {
    const renderer = TestRenderer.make();
    const baseLayer = Layer.mergeAll(NodeServices.layer, renderer.layer, TestFlagsLayer());
    const wsLayer = Layer.provide(coreWorkspaceLayer({ scope: "project" }), baseLayer);
    const fullLayer = Layer.mergeAll(baseLayer, wsLayer);
    return <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(fullLayer));
  };

  it.effect("enables instruction-file management", () => {
    const provide = makeProvide();
    initWorkspace(tempDir, ["claude-code"]);
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

    return provide(
      Effect.gen(function* () {
        yield* handleRulesEnable({ fileName: "AGENTS.md", gitignore: true });

        const settings = JSON.parse(
          fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8"),
        );
        expect(settings.rulesConfig.instructions).toEqual({
          fileName: "AGENTS.md",
          gitignore: true,
        });
      }),
    );
  });
});
