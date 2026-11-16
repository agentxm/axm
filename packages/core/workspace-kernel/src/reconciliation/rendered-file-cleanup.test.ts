/**
 * Agent-output cleanup classifies and keys its outputs from the observations
 * its own pre-removal inventory made in the same call. Every removal still
 * proves its own route and receipt, and the post-removal inventory is fresh.
 */
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { codingAgentForId } from "../agent-adapters/index.js";
import { NativeWriteAuthorityPermissive } from "../agent-adapters/testing.js";
import {
  captureCopiedDirectory,
  copiedDirectoryReceiptPath,
  NativeLocationError,
} from "../locations/index.js";
import { NativePlatformTest } from "../locations/testing.js";
import {
  CodingAgentRepository,
  observeAgentOutputs,
  projectionOutputDigest,
  type AgentOutputAuthority,
  type CodingAgentRepositoryService,
} from "../projection/index.js";
import {
  LOCKFILE_VERSION,
  ProjectionUnitPathSchema,
  type Lockfile,
} from "../workspace-state/index.js";
import { WorkspaceReadTest } from "../workspace-state/testing.js";
import { WorkspaceLocation } from "../workspace-state/index.js";
import { reconcileAgentOutputs, type ReconcileAgentOutputsArgs } from "./rendered-file-cleanup.js";

const cursor = codingAgentForId("cursor");
const repository: CodingAgentRepositoryService = {
  get: () => Effect.succeed(cursor),
  all: Effect.succeed([cursor]),
  getConfiguredAgents: () => Effect.succeed([]),
  getMaterializationAgents: () => Effect.succeed([]),
  getUnknownConfiguredAgentIds: () => Effect.succeed([]),
};

const authority = (overrides: Partial<AgentOutputAuthority>): AgentOutputAuthority => ({
  expectedRegions: { rule: [], knowledge: [] },
  expectedHooks: [],
  declaredMcpNames: new Set<string>(),
  expectedSkillSources: {},
  expectedSubagentNames: new Set<string>(),
  ...overrides,
});

const names = (skill: ReadonlyArray<string> = []) => ({
  skill: new Set(skill),
  subagent: new Set<string>(),
  "mcp-server": new Set<string>(),
  hook: new Set<string>(),
});

/** A lockfile recording AXM's last write of each Subagent file. */
const recordedSubagents = (rows: Readonly<Record<string, string>>): Effect.Effect<Lockfile> =>
  Effect.gen(function* () {
    return {
      lockfileVersion: LOCKFILE_VERSION,
      skills: {},
      projections: {
        subagents: {
          contract: 1,
          units: Object.fromEntries(
            yield* Effect.forEach(Object.entries(rows), ([unit, bytes]) =>
              Effect.gen(function* () {
                return [
                  ProjectionUnitPathSchema.make(unit),
                  { output: yield* projectionOutputDigest(bytes) },
                ] as const;
              }),
            ),
          ),
        },
      },
    };
  });

const workspace = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.realPath(yield* fs.makeTempDirectoryScoped({ prefix: "axm-cleanup-" }));
  const write = (relative: string, content: string) =>
    Effect.gen(function* () {
      const file = path.join(root, relative);
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.writeFileString(file, content);
      return file;
    });
  return { fs, path, root, write };
});

const cleanupLayer = (root: string, lockfile?: Lockfile) =>
  Layer.mergeAll(
    NativeWriteAuthorityPermissive,
    WorkspaceReadTest({
      baseDir: root,
      runtimeDir: `${root}/.axm`,
      ...(lockfile === undefined ? {} : { lockfile }),
    }),
    Layer.succeed(CodingAgentRepository, repository),
  );

/** Run one cleanup call through a recording view of the live filesystem. */
const reconcileRecorded = (
  root: string,
  args: ReconcileAgentOutputsArgs,
  options: { readonly lockfile?: Lockfile; readonly fileSystem?: FileSystem.FileSystem } = {},
) =>
  Effect.gen(function* () {
    const { fileSystem, recording } = makeRecordingFileSystem(
      options.fileSystem ?? (yield* FileSystem.FileSystem),
    );
    const layer = cleanupLayer(root, options.lockfile);
    recording.reset();
    const result = yield* reconcileAgentOutputs(args).pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provide(layer),
      Effect.result,
    );
    return { result, recording };
  });

const succeeded = <A, E>(result: Result.Result<A, E>): A =>
  Result.isSuccess(result) ? result.success : expect.unreachable(String(result.failure));

/** A bounded copy of `review` in the shared skill directory, and an unproven directory beside it. */
const copiedSkill = Effect.gen(function* () {
  const { fs, path, root, write } = yield* workspace;
  const source = path.dirname(yield* write("source/review/SKILL.md", "# Review\n"));
  const container = path.join(root, ".agents/skills");
  const target = path.join(container, "review");
  yield* write(".agents/skills/review/SKILL.md", "# Review\n");
  expect(Option.isSome(yield* captureCopiedDirectory(target, source))).toBe(true);
  const unproven = path.dirname(yield* write(".agents/skills/mine/SKILL.md", "# Mine\n"));
  return {
    fs,
    root,
    source,
    container,
    target,
    unproven,
    receipt: yield* copiedDirectoryReceiptPath(target),
    unprovenReceipt: yield* copiedDirectoryReceiptPath(unproven),
  };
});

/** The copy's receipt reads and the resolution calls on its entry, its container and its neighbour's receipt. */
const copyWork = (
  recording: ReturnType<typeof makeRecordingFileSystem>["recording"],
  fixture: {
    readonly receipt: string;
    readonly target: string;
    readonly container: string;
    readonly unprovenReceipt: string;
  },
) => ({
  receiptReads: recording.contentReads(fixture.receipt),
  target: recording.counts(fixture.target),
  container: recording.counts(fixture.container),
  unprovenReceipt: recording.counts(fixture.unprovenReceipt),
});

describe("copied skill classification within one cleanup call", () => {
  const args = (source: string, desired: boolean): ReconcileAgentOutputsArgs => ({
    desiredAgentIds: new Set<string>(),
    expectedNames: names(desired ? ["review"] : []),
    authority: authority({ expectedSkillSources: { review: [source] } }),
  });

  it.effect("reads a retained copy's receipt once while describing it", () =>
    Effect.gen(function* () {
      const fixture = yield* copiedSkill;
      const { result, recording } = yield* reconcileRecorded(fixture.root, {
        ...args(fixture.source, true),
        dryRun: true,
      });
      const preview = succeeded(result);
      expect(preview.nativeLocations).toContainEqual(
        expect.objectContaining({
          address: { kind: "entry", path: fixture.target },
          mechanism: "copied-directory",
          proof: "bounded-copy-receipt",
          state: "retained",
        }),
      );
      // The unproven directory's receipt is still probed by the classification itself.
      expect(copyWork(recording, fixture)).toEqual({
        receiptReads: 1,
        target: { readLink: 2, stat: 3, realPath: 2 },
        container: { realPath: 3, readDirectory: 8 },
        unprovenReceipt: { readLink: 4, stat: 2 },
      });
      expect(preview.nativeLocations).toContainEqual(
        expect.objectContaining({
          address: { kind: "entry", path: fixture.unproven },
          ownership: "unowned",
          state: "retained",
        }),
      );
      expect(
        preview.nativeLocations?.find((unit) => unit.address.path === fixture.unproven),
      ).not.toHaveProperty("mechanism");
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("reads a retained copy's receipt once before and once after applying", () =>
    Effect.gen(function* () {
      const fixture = yield* copiedSkill;
      const { result, recording } = yield* reconcileRecorded(
        fixture.root,
        args(fixture.source, true),
      );
      succeeded(result);
      expect(copyWork(recording, fixture)).toEqual({
        receiptReads: 2,
        target: { readLink: 4, stat: 6, realPath: 4 },
        container: { realPath: 5, readDirectory: 15 },
        unprovenReceipt: { readLink: 6, stat: 3 },
      });
      expect(yield* fixture.fs.exists(fixture.receipt)).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("re-proves a withdrawn copy's receipt only when retiring it", () =>
    Effect.gen(function* () {
      const fixture = yield* copiedSkill;
      const { result, recording } = yield* reconcileRecorded(
        fixture.root,
        args(fixture.source, false),
      );
      const applied = succeeded(result);
      expect(copyWork(recording, fixture)).toEqual({
        receiptReads: 2,
        target: { readLink: 6, stat: 7, realPath: 4, readDirectory: 2, remove: 1 },
        container: { realPath: 6, readDirectory: 15 },
        unprovenReceipt: { readLink: 6, stat: 3 },
      });
      expect(yield* fixture.fs.exists(fixture.target)).toBe(false);
      expect(yield* fixture.fs.exists(fixture.receipt)).toBe(false);
      expect(applied.removedPaths).toEqual([fixture.target]);
      expect(applied.nativeLocations).toContainEqual(
        expect.objectContaining({
          address: { kind: "entry", path: fixture.target },
          mechanism: "copied-directory",
          ownership: "absent",
          state: "removed",
        }),
      );
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("keeps a prepared inventory's description on its own live classification", () =>
    Effect.gen(function* () {
      const fixture = yield* copiedSkill;
      // An uninstall preparation's inventory, observed in its own read phase.
      const prepared = yield* Effect.gen(function* () {
        const location = yield* WorkspaceLocation;
        return yield* observeAgentOutputs({
          workspaceRoot: location.baseDir,
          nativeDirectoryInputs: location.nativeDirectoryInputs,
          scope: location.scope,
          desiredAgentIds: new Set<string>(),
          expectedNames: names(["review"]),
          authoredSkills: { layout: yield* Ref.get(location.layout), entries: {} },
          ...authority({ expectedSkillSources: { review: [fixture.source] } }),
        });
      }).pipe(Effect.provide(cleanupLayer(fixture.root)));
      const { result, recording } = yield* reconcileRecorded(fixture.root, {
        ...args(fixture.source, true),
        dryRun: true,
        preparedInventory: prepared,
      });
      succeeded(result);
      expect(copyWork(recording, fixture)).toEqual({
        receiptReads: 1,
        target: { readLink: 2, stat: 3, realPath: 2 },
        container: { readDirectory: 4, realPath: 2 },
        unprovenReceipt: { readLink: 2, stat: 1 },
      });
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("describes an unreadable shared skill container alike before and while applying", () =>
    Effect.gen(function* () {
      const { root, write } = yield* workspace;
      const container = yield* write(".agents/skills", "not a directory\n");
      const cleanup = {
        desiredAgentIds: new Set<string>(),
        expectedNames: names(),
        authority: authority({}),
      };
      const preview = succeeded(
        (yield* reconcileRecorded(root, { ...cleanup, dryRun: true })).result,
      );
      const applied = succeeded((yield* reconcileRecorded(root, cleanup)).result);
      const expected = expect.objectContaining({
        address: { kind: "entry", path: container },
        ownership: "unowned",
        state: "retained",
      });
      expect(preview.nativeLocations).toEqual([expected]);
      expect(applied.nativeLocations).toEqual([expected]);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("does no skill classification work without skill outputs", () =>
    Effect.gen(function* () {
      const { path, root } = yield* workspace;
      const { result, recording } = yield* reconcileRecorded(root, {
        desiredAgentIds: new Set<string>(),
        expectedNames: names(),
        authority: authority({}),
        dryRun: true,
      });
      expect(succeeded(result).nativeLocations).toEqual([]);
      const unobserved = { realPath: 1, readLink: 1, readDirectory: 1 };
      expect({
        shared: recording.counts(path.join(root, ".agents/skills")),
        reader: recording.counts(path.join(root, ".cursor/skills")),
      }).toEqual({ shared: unobserved, reader: unobserved });
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});

describe("Subagent residue keys within one cleanup call", () => {
  const residue = (files: ReadonlyArray<string>, owned = true) =>
    Effect.gen(function* () {
      const { fs, path, root, write } = yield* workspace;
      const rows: Record<string, string> = {};
      for (const name of files) {
        yield* write(`.cursor/agents/${name}.md`, `${name} body\n`);
        rows[`.cursor/agents/${name}.md`] = `${name} body\n`;
      }
      return {
        fs,
        path,
        root,
        write,
        lockfile: yield* recordedSubagents(rows),
        args: {
          desiredAgentIds: new Set<string>(),
          expectedNames: names(),
          authority: authority({ expectedSubagentNames: new Set(owned ? files : []) }),
        } satisfies ReconcileAgentOutputsArgs,
      };
    });

  const scopeRootWork = (
    recording: ReturnType<typeof makeRecordingFileSystem>["recording"],
    root: string,
    parent: string,
  ) => ({
    realPath: recording.counts(root).realPath ?? 0,
    parentListings: recording.calls({ path: parent, method: "readDirectory" }).length,
  });

  it.effect.each([
    {
      case: "three residue files",
      files: ["a", "b", "c"],
      owned: true,
      dry: { realPath: 63, parentListings: 42 },
      apply: { realPath: 128, parentListings: 85 },
    },
    {
      case: "one residue file",
      files: ["a"],
      owned: true,
      dry: { realPath: 63, parentListings: 38 },
      apply: { realPath: 126, parentListings: 75 },
    },
    {
      case: "no Subagent residue",
      files: ["a", "b", "c"],
      owned: false,
      dry: { realPath: 62, parentListings: 38 },
      apply: { realPath: 124, parentListings: 75 },
    },
  ])("resolves the scope root once for $case", (row) =>
    Effect.gen(function* () {
      const fixture = yield* residue(row.files, row.owned);
      const parent = fixture.path.dirname(fixture.root);
      const preview = yield* reconcileRecorded(
        fixture.root,
        { ...fixture.args, dryRun: true },
        { lockfile: fixture.lockfile },
      );
      const withdrawn = row.owned
        ? row.files.map((name) => ({
            kind: "subagents",
            path: `.cursor/agents/${name}.md`,
            row: undefined,
          }))
        : [];
      expect(succeeded(preview.result).rowChanges).toEqual(withdrawn);
      const applied = yield* reconcileRecorded(fixture.root, fixture.args, {
        lockfile: fixture.lockfile,
      });
      expect(succeeded(applied.result).rowChanges).toEqual(withdrawn);
      expect({
        dry: scopeRootWork(preview.recording, fixture.root, parent),
        apply: scopeRootWork(applied.recording, fixture.root, parent),
      }).toEqual({ dry: row.dry, apply: row.apply });
      for (const name of row.files)
        expect(yield* fixture.fs.exists(`${fixture.root}/.cursor/agents/${name}.md`)).toBe(
          !row.owned,
        );
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("refuses on the first residue file when the scope root cannot be resolved", () =>
    Effect.gen(function* () {
      const fixture = yield* residue(["a", "b"]);
      const denied: FileSystem.FileSystem = {
        ...fixture.fs,
        realPath: (target) =>
          target === fixture.root
            ? Effect.fail(
                PlatformError.systemError({
                  _tag: "PermissionDenied",
                  module: "FileSystem",
                  method: "realPath",
                  pathOrDescriptor: target,
                }),
              )
            : fixture.fs.realPath(target),
      };
      const { result, recording } = yield* reconcileRecorded(
        fixture.root,
        { ...fixture.args, dryRun: true },
        { lockfile: fixture.lockfile, fileSystem: denied },
      );
      if (result._tag === "Success") return expect.unreachable("the scope root is unreadable");
      expect(result.failure).toMatchObject({ detail: "Cannot locate a recorded Subagent output" });
      expect(result.failure).toHaveProperty("cause");
      const cause = "cause" in result.failure ? result.failure.cause : undefined;
      expect(cause).toBeInstanceOf(NativeLocationError);
      expect(cause).toMatchObject({ target: fixture.root, reason: "unreadable" });
      expect(recording.counts(fixture.root).realPath).toBe(5);
      for (const name of ["a", "b"])
        expect(recording.contentReads(`${fixture.root}/.cursor/agents/${name}.md`)).toBe(0);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("keys a linked residue file from its referent", () =>
    Effect.gen(function* () {
      const fixture = yield* residue(["a"]);
      const elsewhere = yield* fixture.write("elsewhere/b.md", "b body\n");
      yield* fixture.fs.symlink(elsewhere, `${fixture.root}/.cursor/agents/b.md`);
      const lockfile = yield* recordedSubagents({
        ".cursor/agents/a.md": "a body\n",
        "elsewhere/b.md": "b body\n",
      });
      const { result } = yield* reconcileRecorded(
        fixture.root,
        {
          ...fixture.args,
          authority: authority({ expectedSubagentNames: new Set(["a", "b"]) }),
          dryRun: true,
        },
        { lockfile },
      );
      expect(succeeded(result).rowChanges).toEqual([
        { kind: "subagents", path: ".cursor/agents/a.md", row: undefined },
        { kind: "subagents", path: "elsewhere/b.md", row: undefined },
      ]);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});
