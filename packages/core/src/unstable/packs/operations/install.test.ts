import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { TestRenderer, logsByTag } from "../../cli-renderer/index.js";
import { makeAppError } from "../../app-error/index.js";
import { computePackageContentHash, type ExtensionRef } from "../../extensions/index.js";
import { SourceHostProviders } from "../../source-resolution/index.js";
import type { SourceHostProvidersService } from "../../source-resolution/index.js";
import {
  WorkspaceMutations,
  type SetPackArgs,
  type WorkspaceMutationsService,
} from "../../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import { exactVersion, extensionName, handle } from "../../test-helpers.js";
import type { InstallPackOperation } from "./install.js";
import { installPack } from "./install.js";

const makePackRef = () => ({
  type: "pack" as const,
  refType: "registry" as const,
  pack: {
    name: extensionName("frontend-pack"),
    dependencies: {},
  },
  source: {
    type: "registry" as const,
    location: new URL("file:///tmp/reg"),
    owner: Option.none(),
  },
  owner: handle("@acme"),
  publisherBindingId: "hbnd_test",
  name: extensionName("frontend-pack"),
  version: exactVersion("1.0.0"),
  integrity: Option.none(),
  packages: [],
});

const makeOp = (): InstallPackOperation => ({
  name: "install-pack",
  args: {
    packName: "frontend-pack",
    owner: handle("@acme"),
    resolvedVersion: exactVersion("1.0.0"),
    integrity: "sha512-test",
    sourceName: "default",

    publisherBindingId: "hbnd_test",
    resolvedSkills: {},
    resolvedMcpServers: {},
    resolvedSubagents: {},
    resolvedRules: {},
    resolvedHooks: {},
    resolvedKnowledge: {},
    versionRange: Option.none(),
    ref: makePackRef(),
  },
});

const withServices = (
  axmDir: string,
  packDirectory: string,
  wsOverrides?: Partial<WorkspaceMutationsService> & Partial<WorkspaceMutationsService["records"]>,
) => makeServices(axmDir, packDirectory, wsOverrides).layer;

const makeServices = (
  axmDir: string,
  packDirectory: string,
  wsOverrides?: Partial<WorkspaceMutationsService> & Partial<WorkspaceMutationsService["records"]>,
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
  const renderer = TestRenderer.make();

  return {
    layer: Layer.mergeAll(
      NodeServices.layer,
      WorkspaceMutations.layer(workspace),
      renderer.layer,
      Layer.succeed(SourceHostProviders, sourceProviders),
    ),
    rendererState: renderer.state,
  };
};

describe("installPack", () => {
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
        path.join(packSourceDir, "pack.json"),
        JSON.stringify(
          {
            owner: "@acme",
            type: "pack",
            name: "frontend-pack",
            version: "1.0.0",
            dependencies: {
              "@acme/skills/code-review": "^1.0.0",
            },
          },
          null,
          2,
        ),
      );

      return Effect.gen(function* () {
        const result = yield* installPack(makeOp());

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("internal");
          expect(result.error.detail).toContain("declares dependencies");
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
      path.join(packSourceDir, "pack.json"),
      JSON.stringify(
        {
          owner: "@acme",
          type: "pack",
          name: "frontend-pack",
          version: "1.0.0",
          dependencies: {
            "@acme/skills/code-review": "^1.0.0",
          },
        },
        null,
        2,
      ),
    );

    const op: InstallPackOperation = {
      ...makeOp(),
      args: {
        ...makeOp().args,
        resolvedSkills: {
          "@acme/skills/code-review": {
            version: exactVersion("1.0.0"),
            publisherBindingId: "hbnd_test",
          },
        },
      },
    };

    return Effect.gen(function* () {
      const result = yield* installPack(op);

      expect(result.result).toBe("success");
      expect(fs.existsSync(path.join(packDir, "pack.json"))).toBe(true);
    }).pipe(Effect.provide(withServices(projectDir, packSourceDir)));
  });

  it.effect("succeeds when fetched manifest declares no dependencies", () => {
    const projectDir = path.join(tmpDir, "project");
    const packSourceDir = path.join(tmpDir, "pack-source");
    const packDir = path.join(projectDir, ".axm", "extensions", "@acme", "packs", "frontend-pack");

    fs.mkdirSync(path.join(projectDir, ".axm"), { recursive: true });
    fs.mkdirSync(packSourceDir, { recursive: true });
    fs.writeFileSync(
      path.join(packSourceDir, "pack.json"),
      JSON.stringify(
        {
          owner: "@acme",
          type: "pack",
          name: "frontend-pack",
          version: "1.0.0",
          dependencies: {},
        },
        null,
        2,
      ),
    );

    let writtenPack: SetPackArgs | undefined;
    return Effect.gen(function* () {
      const result = yield* installPack(makeOp());
      const expectedSourceHash = yield* computePackageContentHash(packDir);

      expect(result.result).toBe("success");
      expect(fs.existsSync(path.join(packDir, "pack.json"))).toBe(true);
      expect(writtenPack).toMatchObject({ sourceHash: expectedSourceHash });
    }).pipe(
      Effect.provide(
        withServices(projectDir, packSourceDir, {
          setPack: (args) =>
            Effect.sync(() => {
              writtenPack = args;
            }),
        }),
      ),
    );
  });

  it.effect("returns metadata update warning in result without raw warning logs", () => {
    const projectDir = path.join(tmpDir, "project");
    const packSourceDir = path.join(tmpDir, "pack-source");
    const packDir = path.join(projectDir, ".axm", "extensions", "@acme", "packs", "frontend-pack");

    fs.mkdirSync(path.join(projectDir, ".axm"), { recursive: true });
    fs.mkdirSync(packSourceDir, { recursive: true });
    fs.writeFileSync(
      path.join(packSourceDir, "pack.json"),
      JSON.stringify(
        {
          owner: "@acme",
          type: "pack",
          name: "frontend-pack",
          version: "1.0.0",
          dependencies: {},
        },
        null,
        2,
      ),
    );

    const services = makeServices(projectDir, packSourceDir, {
      setPack: () =>
        Effect.fail(
          makeAppError({
            code: "internal",
            detail: "write failed",
          }),
        ),
    });

    return Effect.gen(function* () {
      const result = yield* installPack(makeOp());

      expect(result.result).toBe("success");
      expect(result.message).toContain("Pack metadata update failed");
      expect(fs.existsSync(path.join(packDir, "pack.json"))).toBe(true);
      expect(logsByTag(services.rendererState).warn).toEqual([]);
    }).pipe(Effect.provide(services.layer));
  });
});
