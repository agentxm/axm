import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Result from "effect/Result";

import { codingAgentFromDescriptor } from "../agent-adapters/index.js";
import {
  captureCopiedDirectory,
  copiedDirectoryReceiptPath,
  resolveNativeReferent,
} from "../locations/index.js";
import { NativePlatformTest } from "../locations/testing.js";
import { WorkspaceFileWriteLocksLive } from "../settlement/live.js";
import { WorkspaceStateTest } from "../workspace-state/testing.js";
import { CodingAgentRepository } from "./agents/coding-agent-repository.js";
import { observeConfiguredSkillLocations } from "./skill-location-observation.js";
import { makeCodingAgentRepository } from "./testing.js";

// One unconditional reader isolates the copied row from vendor-specific location selection.
const fixtureReader = codingAgentFromDescriptor({
  id: "openclaw",
  name: "Fixture Skill reader",
  detection: { project: { markers: [] }, user: { markers: [] } },
  skills: {
    scopes: ["project"],
    writerSupported: false,
    locations: [
      {
        scope: "project",
        root: "project",
        path: "fixture-skills",
        shape: "directory",
        role: "primary",
        status: "canonical",
        applicability: { kind: "always" },
        provenance: { kind: "capability-sources" },
      },
    ],
  },
});
const repositoryLayer = Layer.succeed(CodingAgentRepository, {
  ...makeCodingAgentRepository([fixtureReader.id]),
  all: Effect.succeed([fixtureReader]),
});

// Captures a copy of a workspace skill source at the reader location, applies an optional edit, and
// observes the configured row with the receipt reads recorded.
const observeCopiedRow = (
  edit: (paths: {
    readonly source: string;
    readonly target: string;
  }) => Effect.Effect<void, unknown, FileSystem.FileSystem | Path.Path>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs
      .makeTempDirectoryScoped({ prefix: "axm-copied-skill-row-" })
      .pipe(Effect.flatMap(resolveNativeReferent));
    const write = (relative: string, content: string) =>
      Effect.gen(function* () {
        const file = path.join(root, relative);
        yield* fs.makeDirectory(path.dirname(file), { recursive: true });
        yield* fs.writeFileString(file, content);
      });
    yield* write(
      "axm.json",
      JSON.stringify({
        owner: "@acme",
        agents: [fixtureReader.id],
        skills: { review: { source: "workspace", enabled: true } },
      }),
    );
    yield* write(
      "skills/review/skill.json",
      JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
    );
    const source = path.join(root, "skills/review/src");
    const target = path.join(root, "fixture-skills/review");
    for (const directory of [source, target]) {
      yield* fs.makeDirectory(directory, { recursive: true });
      yield* fs.writeFileString(
        path.join(directory, "SKILL.md"),
        "---\nname: review\ndescription: Review\n---\nReview\n",
      );
      yield* fs.writeFileString(path.join(directory, "README.md"), "Read me\n");
      yield* fs.symlink("README.md", path.join(directory, "link"));
    }
    expect(Option.isSome(yield* captureCopiedDirectory(target, source))).toBe(true);
    yield* edit({ source, target });
    const receiptPath = yield* copiedDirectoryReceiptPath(target);
    const { fileSystem, recording } = makeRecordingFileSystem(fs);
    const state = WorkspaceStateTest({
      projectRoot: decodeAbsolutePathSync(root),
      scope: "project",
    }).pipe(
      Layer.provide(WorkspaceFileWriteLocksLive),
      Layer.provide(
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: `${root}/home` } })),
      ),
    );
    const observed = yield* Effect.gen(function* () {
      recording.reset();
      return yield* observeConfiguredSkillLocations({
        type: "skill",
        state: "current",
        scope: "project",
        agentIds: [fixtureReader.id],
        rows: [{ name: "review", targetState: "enabled", installed: true }],
      });
    }).pipe(
      Effect.provide(Layer.merge(state, repositoryLayer)),
      Effect.provideService(FileSystem.FileSystem, fileSystem),
    );
    const row = observed.get("review");
    return {
      agentReasons: row?.agentOutcomes.map((outcome) => outcome.reasonCode),
      copiedUnits: row?.nativeLocations
        .filter((unit) => unit.aliases.includes(target))
        .map((unit) => ({
          state: unit.state,
          ownership: unit.ownership,
          mechanism: unit.mechanism,
          proof: unit.proof,
          reason: unit.reason,
        })),
      receiptReads: recording.counts(receiptPath).readFile,
    };
  });

describe("configured skill location observation", () => {
  it.effect("reads a copied row's receipt once for ownership and currency", () =>
    Effect.gen(function* () {
      const observed = yield* observeCopiedRow(() => Effect.void);
      expect(observed.agentReasons).toEqual(["verified-native-unit"]);
      expect(observed.copiedUnits).toEqual([
        {
          state: "unchanged",
          ownership: "owned",
          mechanism: "copied-directory",
          proof: "bounded-copy-receipt",
          reason: undefined,
        },
      ]);
      expect(observed.receiptReads).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("still checks a copied row's currency from the single receipt read", () =>
    Effect.gen(function* () {
      const observed = yield* observeCopiedRow(({ target }) =>
        Effect.flatMap(Path.Path, (path) =>
          Effect.flatMap(FileSystem.FileSystem, (fs) =>
            fs.writeFileString(path.join(target, "README.md"), "Edited by hand\n"),
          ),
        ),
      );
      expect(observed.copiedUnits).toEqual([
        {
          state: "blocked",
          ownership: "owned",
          mechanism: "copied-directory",
          proof: "bounded-copy-receipt",
          reason: "The owned copy differs from its canonical source.",
        },
      ]);
      expect(observed.agentReasons).toEqual(["native-content-conflict"]);
      expect(observed.receiptReads).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});

/** An unconditional fixture reader of project Skills at `locationPath`. */
const readerAt = (id: "openclaw" | "adal" | "fx", locationPath: string) =>
  codingAgentFromDescriptor({
    id,
    name: `Fixture Skill reader ${id}`,
    detection: { project: { markers: [] }, user: { markers: [] } },
    skills: {
      scopes: ["project"],
      writerSupported: false,
      locations: [
        {
          scope: "project",
          root: "project",
          path: locationPath,
          shape: "directory",
          role: "primary",
          status: "canonical",
          applicability: { kind: "always" },
          provenance: { kind: "capability-sources" },
        },
      ],
    },
  });

const skillMarkdown = "---\nname: review\ndescription: Review\n---\nReview\n";

/**
 * Observe the configured `review` row over `readers`, after `arrange` shapes
 * the workspace, counting each SKILL.md probe the observation makes.
 */
const observeReaders = (options: {
  readonly readers: ReadonlyArray<ReturnType<typeof readerAt>>;
  readonly arrange: (
    root: string,
  ) => Effect.Effect<void, unknown, FileSystem.FileSystem | Path.Path>;
  readonly failAccessOf?: (root: string) => string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs
      .makeTempDirectoryScoped({ prefix: "axm-skill-readers-" })
      .pipe(Effect.flatMap(resolveNativeReferent));
    const [configured] = options.readers;
    yield* fs.writeFileString(
      path.join(root, "axm.json"),
      JSON.stringify({
        owner: "@acme",
        agents: configured === undefined ? [] : [configured.id],
        skills: { review: { source: "workspace", enabled: true } },
      }),
    );
    yield* fs.makeDirectory(path.join(root, "skills/review/src"), { recursive: true });
    yield* fs.writeFileString(
      path.join(root, "skills/review/skill.json"),
      JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
    );
    yield* fs.writeFileString(path.join(root, "skills/review/src/SKILL.md"), skillMarkdown);
    yield* options.arrange(root);
    const failing = options.failAccessOf?.(root);
    const denied = PlatformError.systemError({
      _tag: "PermissionDenied",
      module: "FileSystem",
      method: "access",
      pathOrDescriptor: failing ?? "",
    });
    const { fileSystem, recording } = makeRecordingFileSystem({
      ...fs,
      access: (file, accessOptions) =>
        file === failing ? Effect.fail(denied) : fs.access(file, accessOptions),
    });
    const state = WorkspaceStateTest({
      projectRoot: decodeAbsolutePathSync(root),
      scope: "project",
    }).pipe(
      Layer.provide(WorkspaceFileWriteLocksLive),
      Layer.provide(
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: `${root}/home` } })),
      ),
    );
    const repository = Layer.succeed(CodingAgentRepository, {
      ...makeCodingAgentRepository(configured === undefined ? [] : [configured.id]),
      all: Effect.succeed(options.readers),
    });
    const observed = yield* Effect.gen(function* () {
      recording.reset();
      return yield* observeConfiguredSkillLocations({
        type: "skill",
        state: "current",
        scope: "project",
        agentIds: configured === undefined ? [] : [configured.id],
        rows: [{ name: "review", targetState: "enabled", installed: true }],
      });
    }).pipe(
      Effect.provide(Layer.merge(state, repository)),
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.result,
    );
    const row = Result.isSuccess(observed) ? observed.success.get("review") : undefined;
    return {
      failure: Result.isFailure(observed) ? observed.failure : undefined,
      denied,
      agentReasons: row?.agentOutcomes.map((outcome) => outcome.reasonCode),
      units: row?.nativeLocations.map((unit) => ({
        aliases: unit.aliases.map((alias) => path.relative(root, alias)),
        state: unit.state,
        ownership: unit.ownership,
        proof: unit.proof,
      })),
      probes: (relative: string) => recording.counts(path.join(root, relative)).access ?? 0,
      skillProbes: recording
        .calls({ method: "access" })
        .filter((call) => path.basename(call.path) === "SKILL.md").length,
    };
  });

const writeSkillCopy = (root: string, relative: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = path.join(root, relative);
    yield* fs.makeDirectory(target, { recursive: true });
    yield* fs.writeFileString(path.join(target, "SKILL.md"), skillMarkdown);
    expect(
      Option.isSome(yield* captureCopiedDirectory(target, path.join(root, "skills/review/src"))),
    ).toBe(true);
  });

const linkToSource = (root: string, relative: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const link = path.join(root, relative);
    yield* fs.makeDirectory(path.dirname(link), { recursive: true });
    yield* fs.symlink(
      path.relative(path.dirname(link), path.join(root, "skills/review/src")),
      link,
    );
  });

const linkedUnits = (state: "unchanged" | "blocked") => [
  { aliases: [".agents/skills/review"], state: "absent", ownership: "absent" },
  ...["link-a/review", "link-b/review"].map((alias) => ({
    aliases: [alias],
    state,
    ownership: "owned",
    proof: "exact-canonical-source-link",
  })),
];

const linkedReaders = [readerAt("openclaw", "link-a"), readerAt("adal", "link-b")];

const arrangeLinks = (root: string) =>
  Effect.gen(function* () {
    yield* linkToSource(root, "link-a/review");
    yield* linkToSource(root, "link-b/review");
  });

const sharedCopyReaders = [
  readerAt("openclaw", "fixture-skills"),
  readerAt("adal", "fixture-skills"),
  readerAt("fx", "fixture-skills"),
];

describe("configured skill location SKILL.md probes", () => {
  it.effect("probes a copied entry's SKILL.md once for every reader that shares it", () =>
    Effect.gen(function* () {
      const observed = yield* observeReaders({
        readers: sharedCopyReaders,
        arrange: (root) => writeSkillCopy(root, "fixture-skills/review"),
      });
      expect(observed.failure).toBeUndefined();
      expect(observed.probes("fixture-skills/review/SKILL.md")).toBe(1);
      expect(observed.agentReasons).toEqual(["verified-native-unit"]);
      expect(observed.units).toEqual([
        { aliases: [".agents/skills/review"], state: "absent", ownership: "absent" },
        {
          aliases: ["fixture-skills/review"],
          state: "unchanged",
          ownership: "owned",
          proof: "bounded-copy-receipt",
        },
      ]);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("probes a canonical source's SKILL.md once for every link to it", () =>
    Effect.gen(function* () {
      const observed = yield* observeReaders({
        readers: linkedReaders,
        arrange: arrangeLinks,
      });
      expect(observed.failure).toBeUndefined();
      expect(observed.probes("skills/review/src/SKILL.md")).toBe(1);
      expect(observed.agentReasons).toEqual(["verified-native-unit"]);
      expect(observed.units).toEqual(linkedUnits("unchanged"));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("still blocks linked entries whose canonical source lost its SKILL.md", () =>
    Effect.gen(function* () {
      const observed = yield* observeReaders({
        readers: linkedReaders,
        arrange: (root) =>
          Effect.gen(function* () {
            yield* arrangeLinks(root);
            const fs = yield* FileSystem.FileSystem;
            yield* fs.remove(`${root}/skills/review/src/SKILL.md`);
          }),
      });
      expect(observed.failure).toBeUndefined();
      expect(observed.probes("skills/review/src/SKILL.md")).toBe(1);
      expect(observed.agentReasons).toEqual(["native-content-conflict"]);
      expect(observed.units).toEqual(linkedUnits("blocked"));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("fails with the first SKILL.md probe failure and probes it no further", () =>
    Effect.gen(function* () {
      const observed = yield* observeReaders({
        readers: sharedCopyReaders,
        arrange: (root) => writeSkillCopy(root, "fixture-skills/review"),
        failAccessOf: (root) => `${root}/fixture-skills/review/SKILL.md`,
      });
      expect(observed.failure).toBe(observed.denied);
      expect(observed.probes("fixture-skills/review/SKILL.md")).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("probes no SKILL.md when every reader entry is absent", () =>
    Effect.gen(function* () {
      const observed = yield* observeReaders({
        readers: sharedCopyReaders,
        arrange: () => Effect.void,
      });
      expect(observed.failure).toBeUndefined();
      expect(observed.skillProbes).toBe(0);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});
