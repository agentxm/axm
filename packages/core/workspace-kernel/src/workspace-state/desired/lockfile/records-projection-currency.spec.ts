import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { stringify as stringifyToml } from "smol-toml";

import { decodeLockfileBytes } from "../../observed/state.js";
import { WorkspaceFileWriteLocks } from "../../../settlement/index.js";
import { WorkspaceFileWriteLocksLive } from "../../../settlement/live.js";
import { makeAcceptedResolutionWriter } from "../../workspace/accepted-resolution-writer.js";
import {
  batchableWorkspaceDocuments,
  type WorkspaceDocumentsService,
} from "../../workspace/documents.js";
import { writeLockfileAtPath } from "./lockfile.js";
import {
  applyKindChanges,
  patchProjections,
  PROJECTION_CONTRACTS,
  ProjectionDigestSchema,
  ProjectionUnitPathSchema,
  type ProjectionKindState,
  type Projections,
} from "./projections.js";
import { LOCKFILE_VERSION, LockfileSchema, type Lockfile } from "./schema.js";
import { emitLockfileToml, parseLockfileToml } from "./toml.js";

export const specification = defineSpecification({
  requirement: "workspace/lockfile/records-projection-currency",
  title: "The lockfile records projection generation currency per unit",
  statement:
    "AXM shall record, per projection kind, one contract number and one row per projection unit keyed by its scope-relative path, holding the input-only generation digest and the digest of the bytes AXM last wrote. Unit keys shall be written sorted and absolute or escaping keys shall be rejected. A contract change shall make every unrecorded-by-this-write unit of that kind stale by removing its generation while keeping its written-bytes digest, under staging and concurrent merging alike. Rows shall be staged only inside an accepted-resolution batch, and introducing then withdrawing a row shall restore the prior lockfile bytes exactly.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Row staging, snapshot merging and exact restoration are observable only through lockfile bytes and the accepted-resolution writer.",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const digest = (character: string) => ProjectionDigestSchema.make(`sha256:${character.repeat(64)}`);
const unit = (path: string) => ProjectionUnitPathSchema.make(path);
const empty: Lockfile = { lockfileVersion: LOCKFILE_VERSION, skills: {} };
const encodeToml = (lockfile: Lockfile) =>
  emitLockfileToml(Schema.encodeSync(LockfileSchema)(lockfile));
const decode = (document: unknown) => Schema.decodeUnknownExit(LockfileSchema)(document);
const platform = WorkspaceFileWriteLocksLive.pipe(Layer.provideMerge(NodeServices.layer));

const rulesState = (contract: number): ProjectionKindState => ({
  contract,
  units: {
    [unit("AGENTS.md")]: { gen: digest("a"), output: digest("b") },
    [unit("docs/AGENTS.md")]: { gen: digest("c"), output: digest("d") },
  },
});

describe("projection rows in the lockfile", () => {
  it("encodes kinds with sorted unit keys and drops empty kinds", () => {
    const projections: Projections = {
      instructions: {
        contract: 1,
        units: {
          [unit("CLAUDE.md")]: { gen: digest("1"), output: digest("2") },
          [unit(".gitignore")]: { gen: digest("3"), output: digest("4") },
        },
      },
      subagents: { contract: 1, units: {} },
    };
    const encoded = Schema.encodeSync(LockfileSchema)({ ...empty, projections });
    expect(encoded.projections).toEqual({
      instructions: {
        contract: 1,
        units: {
          ".gitignore": { gen: digest("3"), output: digest("4") },
          "CLAUDE.md": { gen: digest("1"), output: digest("2") },
        },
      },
    });
    expect(Object.keys(encoded.projections?.instructions?.units ?? {})).toEqual([
      ".gitignore",
      "CLAUDE.md",
    ]);
    const onlyEmpty = Schema.encodeSync(LockfileSchema)({
      ...empty,
      projections: { rules: { contract: 1, units: {} } },
    });
    expect(Object.hasOwn(onlyEmpty, "projections")).toBe(false);
  });

  it("round-trips rows through the stored document", () => {
    const lockfile: Lockfile = { ...empty, projections: { rules: rulesState(1) } };
    const decoded = decode(parseLockfileToml(encodeToml(lockfile)));
    expect(Exit.isSuccess(decoded) ? decoded.value.projections : undefined).toEqual({
      rules: rulesState(1),
    });
  });

  const row = { gen: `sha256:${"a".repeat(64)}`, output: `sha256:${"b".repeat(64)}` };
  for (const [label, projections] of [
    ["an absolute key", { rules: { contract: 1, units: { "/etc/AGENTS.md": row } } }],
    ["a drive-letter key", { rules: { contract: 1, units: { "C:/AGENTS.md": row } } }],
    ["an escaping key", { rules: { contract: 1, units: { "../AGENTS.md": row } } }],
    ["a backslash key", { rules: { contract: 1, units: { "docs\\AGENTS.md": row } } }],
    ["an empty segment", { rules: { contract: 1, units: { "docs//AGENTS.md": row } } }],
    ["a dot segment", { rules: { contract: 1, units: { "./AGENTS.md": row } } }],
    ["an empty key", { rules: { contract: 1, units: { "": row } } }],
    [
      "a bare digest",
      { rules: { contract: 1, units: { "AGENTS.md": { output: "b".repeat(64) } } } },
    ],
    ["a missing output", { rules: { contract: 1, units: { "AGENTS.md": { gen: row.gen } } } }],
    [
      "an unknown row field",
      { rules: { contract: 1, units: { "AGENTS.md": { ...row, src: "x" } } } },
    ],
    ["an unknown kind", { hooks: { contract: 1, units: { "AGENTS.md": row } } }],
    ["a zero contract", { rules: { contract: 0, units: { "AGENTS.md": row } } }],
  ] as const) {
    it.effect(`rejects ${label}`, () =>
      Effect.gen(function* () {
        const document = { version: LOCKFILE_VERSION, projections };
        const exit = yield* Effect.exit(decodeLockfileBytes("axm.lock", stringifyToml(document)));
        expect(Exit.isFailure(exit)).toBe(true);
      }),
    );
  }

  it.effect("refuses a newer lockfile version before any projection row is read", () =>
    Effect.gen(function* () {
      const newer = encodeToml({ ...empty, projections: { rules: rulesState(1) } }).replace(
        `version = ${LOCKFILE_VERSION}`,
        `version = ${LOCKFILE_VERSION + 1}`,
      );
      const exit = yield* Effect.exit(decodeLockfileBytes("axm.lock", newer));
      expect(Exit.isFailure(exit)).toBe(true);
    }),
  );
});

describe("the kind-consistency rule", () => {
  it("strips gen and keeps output for rows this write does not set when the contract changes", () => {
    const next = applyKindChanges(rulesState(1), 2, [
      { path: unit("AGENTS.md"), row: { gen: digest("e"), output: digest("f") } },
    ]);
    expect(next).toEqual({
      contract: 2,
      units: {
        [unit("AGENTS.md")]: { gen: digest("e"), output: digest("f") },
        [unit("docs/AGENTS.md")]: { output: digest("d") },
      },
    });
  });

  it("never drops rows on a contract change and withdraws only named units", () => {
    expect(applyKindChanges(rulesState(1), 2, [])?.units).toEqual({
      [unit("AGENTS.md")]: { output: digest("b") },
      [unit("docs/AGENTS.md")]: { output: digest("d") },
    });
    expect(
      applyKindChanges(rulesState(1), 1, [{ path: unit("AGENTS.md"), row: undefined }])?.units,
    ).toEqual({ [unit("docs/AGENTS.md")]: { gen: digest("c"), output: digest("d") } });
    expect(
      applyKindChanges(rulesState(1), 1, [
        { path: unit("AGENTS.md"), row: undefined },
        { path: unit("docs/AGENTS.md"), row: undefined },
      ]),
    ).toBeUndefined();
  });

  it("keeps concurrent writers to different units independent", () => {
    const base: Projections = { rules: rulesState(1) };
    const fresh: Projections = {
      rules: {
        contract: 1,
        units: {
          ...rulesState(1).units,
          [unit("docs/AGENTS.md")]: { gen: digest("9"), output: digest("8") },
        },
      },
    };
    const next: Projections = {
      rules: {
        contract: 1,
        units: {
          [unit("AGENTS.md")]: { gen: digest("e"), output: digest("f") },
          [unit("docs/AGENTS.md")]: { gen: digest("c"), output: digest("d") },
        },
      },
      subagents: {
        contract: 1,
        units: {
          [unit(".claude/agents/researcher.md")]: { gen: digest("1"), output: digest("2") },
        },
      },
    };
    expect(patchProjections(fresh, base, next)).toEqual({
      rules: {
        contract: 1,
        units: {
          [unit("AGENTS.md")]: { gen: digest("e"), output: digest("f") },
          [unit("docs/AGENTS.md")]: { gen: digest("9"), output: digest("8") },
        },
      },
      subagents: next.subagents,
    });
  });

  it("applies a contract change under concurrent merging without leaving a current-looking stale row", () => {
    const base: Projections = { rules: rulesState(1) };
    const fresh: Projections = {
      rules: {
        contract: 1,
        units: {
          ...rulesState(1).units,
          [unit("nested/AGENTS.md")]: { gen: digest("7"), output: digest("6") },
        },
      },
    };
    const next: Projections = {
      rules: applyKindChanges(rulesState(1), 2, [
        { path: unit("AGENTS.md"), row: { gen: digest("e"), output: digest("f") } },
      ]),
    };
    expect(patchProjections(fresh, base, next)).toEqual({
      rules: {
        contract: 2,
        units: {
          [unit("AGENTS.md")]: { gen: digest("e"), output: digest("f") },
          [unit("docs/AGENTS.md")]: { output: digest("d") },
          [unit("nested/AGENTS.md")]: { output: digest("6") },
        },
      },
    });
  });
});

describe("staging projection rows", () => {
  const makeWriter = (initial: Lockfile) =>
    Effect.gen(function* () {
      const state = yield* Ref.make(initial);
      const commits = yield* Ref.make(0);
      const documents: WorkspaceDocumentsService = batchableWorkspaceDocuments({
        settings: () => Effect.die("settings are not used by projection staging"),
        acceptedResolutions: Ref.get(state),
        acceptedResolutionState: Effect.succeed("ok"),
        writeSettings: () => Effect.die("settings are not used by projection staging"),
        commitAcceptedResolutions: (_base, next) =>
          Ref.set(state, next).pipe(Effect.andThen(Ref.update(commits, (count) => count + 1))),
      });
      const writer = makeAcceptedResolutionWriter(documents, yield* Semaphore.make(1));
      return { writer, state, commits };
    });

  it.effect("dies when rows are staged outside an accepted-resolution batch", () =>
    Effect.gen(function* () {
      const { writer, state, commits } = yield* makeWriter(empty);
      const exit = yield* Effect.exit(
        writer.stageProjections([
          {
            kind: "rules",
            path: unit("AGENTS.md"),
            row: { gen: digest("a"), output: digest("b") },
          },
        ]),
      );
      expect(Exit.hasDies(exit)).toBe(true);
      expect(yield* Ref.get(commits)).toBe(0);
      expect((yield* Ref.get(state)).projections).toBeUndefined();
    }),
  );

  it.effect("reads pending rows inside the batch and commits them once", () =>
    Effect.gen(function* () {
      const { writer, state, commits } = yield* makeWriter({
        ...empty,
        projections: {
          subagents: { contract: 1, units: { [unit("a.md")]: { output: digest("0") } } },
        },
      });
      const before = yield* writer.projectionRows("subagents");
      expect(before.get(unit("a.md"))).toEqual({ row: { output: digest("0") }, stale: true });
      yield* writer.withBatch(
        Effect.gen(function* () {
          yield* writer.stageProjections([
            {
              kind: "rules",
              path: unit("AGENTS.md"),
              row: { gen: digest("a"), output: digest("b") },
            },
            { kind: "subagents", path: unit("a.md"), row: undefined },
          ]);
          const pending = yield* writer.projectionRows("rules");
          expect(pending.get(unit("AGENTS.md"))).toEqual({
            row: { gen: digest("a"), output: digest("b") },
            stale: false,
          });
          expect(yield* Ref.get(commits)).toBe(0);
        }),
      );
      expect(yield* Ref.get(commits)).toBe(1);
      expect((yield* Ref.get(state)).projections).toEqual({
        rules: {
          contract: PROJECTION_CONTRACTS.rules,
          units: { [unit("AGENTS.md")]: { gen: digest("a"), output: digest("b") } },
        },
      });
    }),
  );

  it.effect("reports rows recorded under another contract as stale", () =>
    Effect.gen(function* () {
      const { writer } = yield* makeWriter({
        ...empty,
        projections: { rules: rulesState(PROJECTION_CONTRACTS.rules + 1) },
      });
      const rows = yield* writer.projectionRows("rules");
      expect([...rows.values()].every((recorded) => recorded.stale)).toBe(true);
    }),
  );

  it.effect("discards staged rows when the batch fails", () =>
    Effect.gen(function* () {
      const { writer, state, commits } = yield* makeWriter(empty);
      const exit = yield* Effect.exit(
        writer.withBatch(
          writer
            .stageProjections([
              {
                kind: "instructions",
                path: unit(".gitignore"),
                row: { gen: digest("a"), output: digest("b") },
              },
            ])
            .pipe(Effect.andThen(Effect.fail("write failed"))),
        ),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      expect(yield* Ref.get(commits)).toBe(0);
      expect((yield* Ref.get(state)).projections).toBeUndefined();
    }),
  );
});

describe("restoring projection rows", () => {
  for (const before of [
    undefined,
    emitLockfileToml({ version: LOCKFILE_VERSION, tool: { example: { kept: true } } }),
  ]) {
    it.effect(
      `restores the prior bytes after a row is introduced and withdrawn (${before === undefined ? "absent" : "present"})`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const runtimeDir = path.join(root, ".axm");
          const target = path.join(root, "axm.lock");
          yield* fs.makeDirectory(runtimeDir);
          if (before !== undefined) yield* fs.writeFileString(target, before);
          const context = {
            nativeRoot: root,
            runtimeDir,
            eligible: true,
            locks: yield* WorkspaceFileWriteLocks,
          };
          const introduced: Lockfile = {
            ...empty,
            projections: {
              subagents: {
                contract: 1,
                units: {
                  [unit(".claude/agents/researcher.md")]: { gen: digest("a"), output: digest("b") },
                },
              },
            },
          };
          yield* writeLockfileAtPath(target, introduced, context);
          const written = yield* fs.readFileString(target);
          expect(written).toContain('".claude/agents/researcher.md" = {');
          yield* writeLockfileAtPath(target, empty, { ...context, eligible: false });
          if (before === undefined) expect(yield* fs.exists(target)).toBe(false);
          else expect(yield* fs.readFileString(target)).toBe(before);
        }).pipe(Effect.scoped, Effect.provide(platform)),
    );
  }

  it.effect(
    "rewrites the whole file canonically and keeps unit keys sorted when one is added",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const target = path.join(root, "axm.lock");
        const first: Lockfile = { ...empty, projections: { rules: rulesState(1) } };
        yield* writeLockfileAtPath(target, first);
        yield* fs.writeFileString(target, `# kept\n${yield* fs.readFileString(target)}`);
        yield* writeLockfileAtPath(target, {
          ...empty,
          projections: {
            rules: {
              contract: 1,
              units: {
                ...rulesState(1).units,
                [unit("CLAUDE.md")]: { gen: digest("e"), output: digest("f") },
              },
            },
          },
        });
        const written = yield* fs.readFileString(target);
        expect(written).not.toContain("# kept");
        expect(written.startsWith("#:schema https://axm.sh/schemas/axm-lock.schema.json\n")).toBe(
          true,
        );
        const rows = Schema.decodeUnknownSync(LockfileSchema)(
          parseLockfileToml(written),
        ).projections;
        expect(Object.keys(rows?.rules?.units ?? {})).toEqual([
          "AGENTS.md",
          "CLAUDE.md",
          "docs/AGENTS.md",
        ]);
      }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});
