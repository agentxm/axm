import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { TestRenderer } from "../../cli-renderer/index.js";
import type { ExtensionRef } from "../../extensions/index.js";
import { SourceHostProviders } from "../../source-resolution/index.js";
import type { SourceHostProvidersService } from "../../source-resolution/index.js";
import { Workspace, type WorkspaceContextService } from "../../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import { exactVersion, extensionName, handle } from "../../test-helpers.js";
import type { InstallExtensionPackOperation } from "./install.js";
import { installExtensionPack } from "./install.js";

const makePackRef = () => ({
  type: "pack" as const,
  refType: "registry" as const,
  pack: {
    name: extensionName("frontend-pack"),
    skills: {},
    commands: {},
    mcpServers: {},
    subagents: {},
  },
  source: {
    type: "registry" as const,
    location: new URL("file:///tmp/reg"),
    owner: Option.none(),
  },
  owner: handle("@acme"),
  name: extensionName("frontend-pack"),
  version: exactVersion("1.0.0"),
  integrity: Option.none(),
  compatiblePackages: [],
});

const makeOp = (): InstallExtensionPackOperation => ({
  name: "install-pack",
  args: {
    packName: "frontend-pack",
    owner: handle("@acme"),
    resolvedVersion: exactVersion("1.0.0"),
    integrity: "sha512-test",
    sourceName: "default",
    resolvedSkills: {},
    resolvedCommands: {},
    resolvedMcpServers: {},
    resolvedSubagents: {},
    versionConstraint: Option.none(),
    ref: makePackRef(),
  },
});

const withServices = (
  axmDir: string,
  packDirectory: string,
  wsOverrides?: Partial<WorkspaceContextService>,
) => {
  const sourceProviders: SourceHostProvidersService = {
    find: () => Effect.succeed<ReadonlyArray<ExtensionRef>>([]),
    fetch: () => Effect.succeed({ directory: packDirectory }),
    cloneUrl: () => Option.none(),
    origin: (source) =>
      source.type === "registry"
        ? source.location.href
        : source.type === "local"
          ? source.path
          : source.type,
  };

  const workspace = makeBaseWorkspaceMock(path.join(axmDir, ".axm"), wsOverrides);

  return Layer.mergeAll(
    NodeServices.layer,
    Workspace.layer(workspace),
    TestRenderer.make().layer,
    Layer.succeed(SourceHostProviders, sourceProviders),
  );
};

describe("installExtensionPack", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "install-pack-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.effect(
    "fails when fetched manifest declares dependencies missing from resolved metadata",
    () => {
      const projectDir = path.join(tmpDir, "project");
      const packSourceDir = path.join(tmpDir, "pack-source");

      fs.mkdirSync(path.join(projectDir, ".axm"), { recursive: true });
      fs.mkdirSync(packSourceDir, { recursive: true });
      fs.writeFileSync(
        path.join(packSourceDir, "extension-pack.json"),
        JSON.stringify(
          {
            owner: "@acme",
            type: "pack",
            name: "frontend-pack",
            version: "1.0.0",
            skills: {
              "@acme/skills/code-review": "^1.0.0",
            },
          },
          null,
          2,
        ),
      );

      return Effect.gen(function* () {
        const result = yield* installExtensionPack(makeOp());

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("PACK_DEPENDENCY_METADATA_MISMATCH");
          expect(result.error.what).toContain("declares dependencies");
        }
      }).pipe(Effect.provide(withServices(projectDir, packSourceDir)));
    },
  );

  it.effect("succeeds when fetched manifest dependencies are all in resolved metadata", () => {
    const projectDir = path.join(tmpDir, "project");
    const packSourceDir = path.join(tmpDir, "pack-source");
    const packDir = path.join(projectDir, ".axm", "extensions", "@acme", "packs", "frontend-pack");

    fs.mkdirSync(path.join(projectDir, ".axm"), { recursive: true });
    fs.mkdirSync(packSourceDir, { recursive: true });
    fs.writeFileSync(
      path.join(packSourceDir, "extension-pack.json"),
      JSON.stringify(
        {
          owner: "@acme",
          type: "pack",
          name: "frontend-pack",
          version: "1.0.0",
          skills: {
            "@acme/skills/code-review": "^1.0.0",
          },
        },
        null,
        2,
      ),
    );

    const op: InstallExtensionPackOperation = {
      ...makeOp(),
      args: {
        ...makeOp().args,
        resolvedSkills: {
          "@acme/skills/code-review": exactVersion("1.0.0"),
        },
      },
    };

    return Effect.gen(function* () {
      const result = yield* installExtensionPack(op);

      expect(result.result).toBe("success");
      expect(fs.existsSync(path.join(packDir, "extension-pack.json"))).toBe(true);
    }).pipe(Effect.provide(withServices(projectDir, packSourceDir)));
  });

  it.effect("succeeds when fetched manifest declares no dependencies", () => {
    const projectDir = path.join(tmpDir, "project");
    const packSourceDir = path.join(tmpDir, "pack-source");
    const packDir = path.join(projectDir, ".axm", "extensions", "@acme", "packs", "frontend-pack");

    fs.mkdirSync(path.join(projectDir, ".axm"), { recursive: true });
    fs.mkdirSync(packSourceDir, { recursive: true });
    fs.writeFileSync(
      path.join(packSourceDir, "extension-pack.json"),
      JSON.stringify(
        {
          owner: "@acme",
          type: "pack",
          name: "frontend-pack",
          version: "1.0.0",
        },
        null,
        2,
      ),
    );

    return Effect.gen(function* () {
      const result = yield* installExtensionPack(makeOp());

      expect(result.result).toBe("success");
      expect(fs.existsSync(path.join(packDir, "extension-pack.json"))).toBe(true);
    }).pipe(Effect.provide(withServices(projectDir, packSourceDir)));
  });
});
