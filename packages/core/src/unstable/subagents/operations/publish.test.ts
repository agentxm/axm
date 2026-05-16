import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { handle } from "../../test-helpers.js";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "../../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import { publishSubagent, type PublishSubagentOperation } from "./publish.js";

const withServices = (axmDir: string, registryRoot: string) => {
  const registrySource = {
    name: "local",
    type: "registry" as const,
    location: new URL(`file://${registryRoot}`),
  };

  const mockWs: WorkspaceMutationsService = makeBaseWorkspaceMock(axmDir, {
    getConfiguredSources: () => Effect.succeed([registrySource]),
    getConfiguredSourceByName: (name: string) =>
      Effect.succeed(name === "local" ? Option.some(registrySource) : Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([registrySource]),
    getConfiguredAgents: () => Effect.succeed([]),
    getConfiguredOwner: () => Effect.succeed(Option.some(handle("@community"))),
  });
  return Layer.mergeAll(NodeServices.layer, WorkspaceMutations.layer(mockWs));
};

const makeOp = (
  overrides: Partial<PublishSubagentOperation["args"]> = {},
): PublishSubagentOperation => ({
  name: "publish-subagent",
  args: {
    name: overrides.name ?? "@community/subagents/my-subagent",
    registryName: overrides.registryName ?? "local",
  },
});

describe("publishSubagent", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "publish-subagent-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const setup = (
    owner = "@community",
    name = "my-subagent",
    manifest: Record<string, unknown> = {},
  ) => {
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    const extensionDir = path.join(base, ".axm", "extensions", owner, "subagents", name);
    const registryRoot = path.join(tmpDir, "registry");
    const srcDir = path.join(extensionDir, "src");

    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(registryRoot, { recursive: true });

    const defaultManifest = {
      owner,
      type: "subagent",
      name,
      version: "0.1.0",
      ...manifest,
    };
    fs.writeFileSync(
      path.join(extensionDir, "subagent.json"),
      JSON.stringify(defaultManifest, null, 2),
    );
    fs.writeFileSync(path.join(srcDir, `${name}.md`), `---\nname: ${name}\n---\n# ${name}\n`);

    return { axmDir, registryRoot };
  };

  it.effect("publishes a subagent extension to the registry", () =>
    Effect.gen(function* () {
      const { axmDir, registryRoot } = setup();

      const result = yield* publishSubagent(
        makeOp({ name: "@community/subagents/my-subagent", registryName: "local" }),
      ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

      expect(result.result).toBe("success");
      expect(result.message).toContain("@community/subagents/my-subagent@0.1.0");
    }),
  );

  it.effect("rejects unrecognized manifest keys before publishing", () =>
    Effect.gen(function* () {
      const { axmDir, registryRoot } = setup("@community", "bad-keys", {
        companionPackages: [{ purl: "pkg:npm/example" }],
      });

      const result = yield* publishSubagent(
        makeOp({ name: "@community/subagents/bad-keys", registryName: "local" }),
      ).pipe(
        Effect.provide(withServices(axmDir, registryRoot)),
        Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
      );

      expect(result.result).toBe("error");
      expect(result.message).toContain("subagent/manifest-keys-recognized");
      expect(result.message).toContain("companionPackages");
    }),
  );
});
