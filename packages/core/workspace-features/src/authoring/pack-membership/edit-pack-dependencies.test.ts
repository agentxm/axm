import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { afterEach, beforeEach, vi } from "vitest";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import type { Settings } from "@agentxm/workspace-kernel/workspace-state";
import {
  MockWorkspaceTransactionScope,
  WorkspaceReadTest,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import { PackManifestSchema } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { handle } from "../test-helpers.js";
import type { EditPackDependenciesOperation } from "./edit-pack-dependencies.js";
import { editPackDependencies } from "./edit-pack-dependencies.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

type EditArgs = EditPackDependenciesOperation["args"];

/** Creates a workspace mock for edit-pack-dependencies tests. */
const makeWorkspaceMock = (
  axmDir: string,
  opts: {
    configuredProfile?: string;
    configuredPacks?: NonNullable<Settings["packs"]>;
  } = {},
) => {
  const configuredProfile = opts.configuredProfile ?? "@myorg";
  const configuredPacks = opts.configuredPacks ?? {
    "my-pack": {
      source: "workspace",
      enabled: true,
    },
  };

  return WorkspaceReadTest({
    baseDir: path.dirname(axmDir),
    runtimeDir: axmDir,
    settings: { owner: handle(configuredProfile), packs: configuredPacks },
  });
};

/** Creates the owned workspace read ports and transaction scope. */
const withServices = (axmDir: string, wsOpts?: Parameters<typeof makeWorkspaceMock>[1]) => {
  return Layer.mergeAll(
    makeWorkspaceMock(axmDir, wsOpts),
    MockWorkspaceTransactionScope(axmDir),
  ).pipe(Layer.provideMerge(NativePlatformTest));
};

/** The same services over a filesystem that records every call. */
const withRecordedServices = (axmDir: string) =>
  Layer.mergeAll(makeWorkspaceMock(axmDir), MockWorkspaceTransactionScope(axmDir)).pipe(
    Layer.provideMerge(
      Layer.merge(NativePlatformTest, layerRecordingFileSystem(NativePlatformTest)),
    ),
  );

/** The prepared input a plan builds from the manifest text it read. */
const prepareManifest = (text: string): EditArgs["prepared"] => ({
  text,
  manifest: Schema.decodeUnknownSync(PackManifestSchema)(JSON.parse(text)),
});

/** Freeze a value and everything it reaches, so any mutation throws. */
const deepFreeze = <T>(value: T): T => {
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
};

/** Creates a pack manifest with dependencies on disk and returns the input a plan prepares from it. */
const createPackManifest = (
  base: string,
  owner: string,
  packName: string,
  dependencies: Record<string, string> = {},
) => {
  const packDir = path.join(base, "packs", packName);
  fs.mkdirSync(packDir, { recursive: true });
  const manifest = {
    owner,
    type: "pack",
    name: packName,
    version: "0.0.1",
    dependencies,
  };
  const content = JSON.stringify(manifest, null, 2) + "\n";
  fs.writeFileSync(path.join(packDir, "pack.json"), content);
  return { packDir, prepared: prepareManifest(content), content };
};

type OpOverrides = Partial<Pick<EditArgs, "packName" | "packOwner">> & Pick<EditArgs, "prepared">;

/** Creates a minimal additions operation for testing. */
const makeAddOp = (
  overrides: OpOverrides & { readonly additions?: Readonly<Record<string, string>> },
): EditPackDependenciesOperation => ({
  name: "edit-pack-dependencies",
  args: {
    packName: overrides.packName ?? "my-pack",
    packOwner: overrides.packOwner ?? handle("@myorg"),
    edit: { _tag: "Add", additions: overrides.additions ?? { "@acme/skills/my-skill": "^1.0.0" } },
    prepared: overrides.prepared,
  },
});

/** Creates a minimal removals operation for testing. */
const makeRemoveOp = (
  overrides: OpOverrides & { readonly removals?: ReadonlyArray<string> },
): EditPackDependenciesOperation => ({
  name: "edit-pack-dependencies",
  args: {
    packName: overrides.packName ?? "my-pack",
    packOwner: overrides.packOwner ?? handle("@myorg"),
    edit: { _tag: "Remove", removals: overrides.removals ?? ["@acme/skills/my-skill"] },
    prepared: overrides.prepared,
  },
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("editPackDependencies", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "edit-pack-dependencies-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const setupBase = () => {
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });
    return { base, axmDir };
  };

  describe("Add", () => {
    describe("happy path", () => {
      it.effect("returns success when additions map is empty", () =>
        Effect.gen(function* () {
          const { axmDir, base } = setupBase();
          const { prepared } = createPackManifest(base, "@myorg", "my-pack");

          const result = yield* editPackDependencies(makeAddOp({ additions: {}, prepared })).pipe(
            Effect.provide(withServices(axmDir)),
          );

          expect(result.result).toBe("success");
        }),
      );
    });

    describe("locked manifest work", () => {
      it.effect(
        "reads the manifest once under the lock and once to verify, parsing only the written text",
        () =>
          Effect.gen(function* () {
            const { axmDir, base } = setupBase();
            const { prepared, content } = createPackManifest(base, "@myorg", "my-pack");
            const manifestPath = path.join(base, "packs", "my-pack", "pack.json");
            const parse = vi.spyOn(JSON, "parse");

            const { recording, preparedTextParses } = yield* Effect.gen(function* () {
              const recording = yield* FileSystemRecorder;
              recording.reset();
              parse.mockClear();
              const result = yield* editPackDependencies(makeAddOp({ prepared }));
              expect(result.result).toBe("success");
              const preparedTextParses = parse.mock.calls.filter(
                ([text]) => text === content,
              ).length;
              return { recording, preparedTextParses };
            }).pipe(
              Effect.provide(withRecordedServices(axmDir)),
              Effect.ensuring(Effect.sync(() => parse.mockRestore())),
            );

            expect(preparedTextParses).toBe(0);
            // The transaction snapshot, the locked stale-check read, and the readback.
            expect(recording.contentReads(manifestPath)).toBe(3);
          }),
      );
    });

    describe("prepared manifest", () => {
      it.effect(
        "derives the update without modifying the prepared input, so a retry writes the same bytes",
        () =>
          Effect.gen(function* () {
            const { axmDir, base } = setupBase();
            const { prepared, content } = createPackManifest(base, "@myorg", "my-pack");
            const manifestPath = path.join(base, "packs", "my-pack", "pack.json");
            const before = structuredClone(prepared.manifest);
            const op = makeAddOp({ prepared: deepFreeze(prepared) });

            const first = yield* editPackDependencies(op).pipe(
              Effect.provide(withServices(axmDir)),
            );
            const written = fs.readFileSync(manifestPath, "utf-8");
            fs.writeFileSync(manifestPath, content);
            const retried = yield* editPackDependencies(op).pipe(
              Effect.provide(withServices(axmDir)),
            );

            expect(prepared.manifest).toEqual(before);
            expect(retried).toEqual(first);
            expect(fs.readFileSync(manifestPath, "utf-8")).toBe(written);
            expect(JSON.parse(written).dependencies).toEqual({ "@acme/skills/my-skill": "^1.0.0" });
          }),
      );

      it.effect("accepts the same bytes written to a new file", () =>
        Effect.gen(function* () {
          const { axmDir, base } = setupBase();
          const { prepared, content } = createPackManifest(base, "@myorg", "my-pack");
          const manifestPath = path.join(base, "packs", "my-pack", "pack.json");
          const original = fs.statSync(manifestPath).ino;
          fs.writeFileSync(`${manifestPath}.next`, content);
          fs.renameSync(`${manifestPath}.next`, manifestPath);
          expect(fs.statSync(manifestPath).ino).not.toBe(original);

          const result = yield* editPackDependencies(makeAddOp({ prepared })).pipe(
            Effect.provide(withServices(axmDir)),
          );

          expect(result.result).toBe("success");
          expect(JSON.parse(fs.readFileSync(manifestPath, "utf-8")).dependencies).toEqual({
            "@acme/skills/my-skill": "^1.0.0",
          });
        }),
      );
    });

    describe("stale manifest conflict", () => {
      const stale = "Pack manifest is stale — it was modified since the plan was created";

      it.effect("refuses a manifest that differs from the prepared text only in whitespace", () =>
        Effect.gen(function* () {
          const { axmDir, base } = setupBase();
          const { prepared, content } = createPackManifest(base, "@myorg", "my-pack");
          const manifestPath = path.join(base, "packs", "my-pack", "pack.json");
          const reformatted = JSON.stringify(JSON.parse(content)) + "\n";
          fs.writeFileSync(manifestPath, reformatted);

          const result = yield* editPackDependencies(makeAddOp({ prepared })).pipe(
            Effect.provide(withServices(axmDir)),
            Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
          );

          expect(result).toEqual({ result: "error", message: stale });
          expect(fs.readFileSync(manifestPath, "utf-8")).toBe(reformatted);
        }),
      );

      it.effect(
        "refuses a second change prepared from the same text after the first is written",
        () =>
          Effect.gen(function* () {
            const { axmDir, base } = setupBase();
            const { prepared } = createPackManifest(base, "@myorg", "my-pack");
            const manifestPath = path.join(base, "packs", "my-pack", "pack.json");

            const first = yield* editPackDependencies(
              makeAddOp({ prepared, additions: { "@acme/skills/first": "^1.0.0" } }),
            ).pipe(Effect.provide(withServices(axmDir)));
            const written = fs.readFileSync(manifestPath, "utf-8");
            const second = yield* editPackDependencies(
              makeAddOp({ prepared, additions: { "@acme/skills/second": "^1.0.0" } }),
            ).pipe(
              Effect.provide(withServices(axmDir)),
              Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
            );

            expect(first.result).toBe("success");
            expect(second).toEqual({ result: "error", message: stale });
            expect(fs.readFileSync(manifestPath, "utf-8")).toBe(written);
          }),
      );
    });

    describe("FQN storage", () => {
      it.effect("writes hook FQNs to manifest dependencies", () =>
        Effect.gen(function* () {
          const { axmDir, base } = setupBase();
          const { prepared } = createPackManifest(base, "@myorg", "my-pack");

          const result = yield* editPackDependencies(
            makeAddOp({
              additions: { "@acme/hooks/my-hook": "^1.0.0" },
              prepared,
            }),
          ).pipe(Effect.provide(withServices(axmDir)));

          expect(result.result).toBe("success");

          const manifestPath = path.join(base, "packs", "my-pack", "pack.json");
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.dependencies["@acme/hooks/my-hook"]).toBe("^1.0.0");
          expect(manifest.hooks).toBeUndefined();
        }),
      );

      it.effect("writes mcp-server FQNs to manifest dependencies", () =>
        Effect.gen(function* () {
          const { axmDir, base } = setupBase();
          const { prepared } = createPackManifest(base, "@myorg", "my-pack");

          const result = yield* editPackDependencies(
            makeAddOp({
              additions: { "@acme/mcps/my-server": "^2.0.0" },
              prepared,
            }),
          ).pipe(Effect.provide(withServices(axmDir)));

          expect(result.result).toBe("success");

          const manifestPath = path.join(base, "packs", "my-pack", "pack.json");
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.dependencies["@acme/mcps/my-server"]).toBe("^2.0.0");
          expect(manifest["mcps"]).toBeUndefined();
        }),
      );

      it.effect("writes mixed FQN types to manifest dependencies", () =>
        Effect.gen(function* () {
          const { axmDir, base } = setupBase();
          const { prepared } = createPackManifest(base, "@myorg", "my-pack");

          const result = yield* editPackDependencies(
            makeAddOp({
              additions: {
                "@acme/skills/my-skill": "^1.0.0",
                "@acme/hooks/my-hook": "^2.0.0",
                "@acme/mcps/my-server": "^3.0.0",
              },
              prepared,
            }),
          ).pipe(Effect.provide(withServices(axmDir)));

          expect(result.result).toBe("success");

          const manifestPath = path.join(base, "packs", "my-pack", "pack.json");
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.dependencies["@acme/skills/my-skill"]).toBe("^1.0.0");
          expect(manifest.dependencies["@acme/hooks/my-hook"]).toBe("^2.0.0");
          expect(manifest.dependencies["@acme/mcps/my-server"]).toBe("^3.0.0");
        }),
      );
    });

    describe("error cases", () => {
      it.effect("fails when manifest file does not exist", () =>
        Effect.gen(function* () {
          const { axmDir, base } = setupBase();
          const { prepared } = createPackManifest(base, "@myorg", "my-pack");
          fs.rmSync(path.join(base, "packs", "my-pack", "pack.json"));

          const result = yield* editPackDependencies(makeAddOp({ prepared })).pipe(
            Effect.provide(withServices(axmDir)),
            Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
          );

          expect(result.result).toBe("error");
        }),
      );
    });
  });

  describe("Remove", () => {
    describe("happy path", () => {
      it.effect("returns success when removals list is empty", () =>
        Effect.gen(function* () {
          const { axmDir, base } = setupBase();
          const { prepared } = createPackManifest(base, "@myorg", "my-pack", {
            "@acme/skills/my-skill": "^1.0.0",
          });

          const result = yield* editPackDependencies(makeRemoveOp({ removals: [], prepared })).pipe(
            Effect.provide(withServices(axmDir)),
          );

          expect(result.result).toBe("success");
        }),
      );
    });

    describe("locked manifest work", () => {
      it.effect(
        "reads the manifest once under the lock and once to verify, parsing only the written text",
        () =>
          Effect.gen(function* () {
            const { axmDir, base } = setupBase();
            const { prepared, content } = createPackManifest(base, "@myorg", "my-pack", {
              "@acme/skills/my-skill": "^1.0.0",
              "@acme/skills/other": "^2.0.0",
            });
            const manifestPath = path.join(base, "packs", "my-pack", "pack.json");
            const parse = vi.spyOn(JSON, "parse");

            const { recording, preparedTextParses } = yield* Effect.gen(function* () {
              const recording = yield* FileSystemRecorder;
              recording.reset();
              parse.mockClear();
              const result = yield* editPackDependencies(makeRemoveOp({ prepared }));
              expect(result.result).toBe("success");
              const preparedTextParses = parse.mock.calls.filter(
                ([text]) => text === content,
              ).length;
              return { recording, preparedTextParses };
            }).pipe(
              Effect.provide(withRecordedServices(axmDir)),
              Effect.ensuring(Effect.sync(() => parse.mockRestore())),
            );

            expect(preparedTextParses).toBe(0);
            // The transaction snapshot, the locked stale-check read, and the readback.
            expect(recording.contentReads(manifestPath)).toBe(3);
          }),
      );
    });

    describe("prepared manifest", () => {
      it.effect(
        "derives the update without modifying the prepared input, so a retry writes the same bytes",
        () =>
          Effect.gen(function* () {
            const { axmDir, base } = setupBase();
            const { prepared, content } = createPackManifest(base, "@myorg", "my-pack", {
              "@acme/skills/my-skill": "^1.0.0",
              "@acme/skills/other": "^2.0.0",
            });
            const manifestPath = path.join(base, "packs", "my-pack", "pack.json");
            const before = structuredClone(prepared.manifest);
            const op = makeRemoveOp({ prepared: deepFreeze(prepared) });

            const first = yield* editPackDependencies(op).pipe(
              Effect.provide(withServices(axmDir)),
            );
            const written = fs.readFileSync(manifestPath, "utf-8");
            fs.writeFileSync(manifestPath, content);
            const retried = yield* editPackDependencies(op).pipe(
              Effect.provide(withServices(axmDir)),
            );

            expect(prepared.manifest).toEqual(before);
            expect(retried).toEqual(first);
            expect(fs.readFileSync(manifestPath, "utf-8")).toBe(written);
            expect(JSON.parse(written).dependencies).toEqual({ "@acme/skills/other": "^2.0.0" });
          }),
      );
    });

    describe("stale manifest conflict", () => {
      const stale = "Pack manifest is stale — it was modified since the plan was created";

      it.effect("refuses a manifest that differs from the prepared text only in whitespace", () =>
        Effect.gen(function* () {
          const { axmDir, base } = setupBase();
          const { prepared, content } = createPackManifest(base, "@myorg", "my-pack", {
            "@acme/skills/my-skill": "^1.0.0",
          });
          const manifestPath = path.join(base, "packs", "my-pack", "pack.json");
          const reformatted = JSON.stringify(JSON.parse(content)) + "\n";
          fs.writeFileSync(manifestPath, reformatted);

          const result = yield* editPackDependencies(makeRemoveOp({ prepared })).pipe(
            Effect.provide(withServices(axmDir)),
            Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
          );

          expect(result).toEqual({ result: "error", message: stale });
          expect(fs.readFileSync(manifestPath, "utf-8")).toBe(reformatted);
        }),
      );

      it.effect(
        "refuses a second change prepared from the same text after the first is written",
        () =>
          Effect.gen(function* () {
            const { axmDir, base } = setupBase();
            const { prepared } = createPackManifest(base, "@myorg", "my-pack", {
              "@acme/skills/first": "^1.0.0",
              "@acme/skills/second": "^1.0.0",
            });
            const manifestPath = path.join(base, "packs", "my-pack", "pack.json");

            const first = yield* editPackDependencies(
              makeRemoveOp({ prepared, removals: ["@acme/skills/first"] }),
            ).pipe(Effect.provide(withServices(axmDir)));
            const written = fs.readFileSync(manifestPath, "utf-8");
            const second = yield* editPackDependencies(
              makeRemoveOp({ prepared, removals: ["@acme/skills/second"] }),
            ).pipe(
              Effect.provide(withServices(axmDir)),
              Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
            );

            expect(first.result).toBe("success");
            expect(second).toEqual({ result: "error", message: stale });
            expect(fs.readFileSync(manifestPath, "utf-8")).toBe(written);
          }),
      );
    });

    describe("error cases", () => {
      it.effect("fails when manifest file does not exist", () =>
        Effect.gen(function* () {
          const { axmDir, base } = setupBase();
          const { prepared } = createPackManifest(base, "@myorg", "my-pack", {
            "@acme/skills/my-skill": "^1.0.0",
          });
          fs.rmSync(path.join(base, "packs", "my-pack", "pack.json"));

          const result = yield* editPackDependencies(makeRemoveOp({ prepared })).pipe(
            Effect.provide(withServices(axmDir)),
            Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
          );

          expect(result.result).toBe("error");
        }),
      );
    });
  });
});
