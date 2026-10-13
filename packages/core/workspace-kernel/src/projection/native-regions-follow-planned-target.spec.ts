import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Layer from "effect/Layer";
import {
  projectionGeneration,
  projectionOutputDigest,
  reconcileNativeManagedRegion,
  retargetedRegionRows,
  type NativeManagedRegionArgs,
  type NativeRegionSource,
} from "./index.js";
import { NativeWriteAuthorityLive } from "./live.js";
import { NativeWriteAuthority, NativeWriteRefused } from "../agent-adapters/index.js";
import { makeRecordingNativeWriteAuthority } from "../agent-adapters/testing.js";
import {
  ProjectionUnitPathSchema,
  type ProjectionRowChange,
  type RecordedProjectionRow,
} from "../workspace-state/index.js";
import { WorkspaceReadTest } from "../workspace-state/testing.js";
import { WorkspaceFileWriteLocksLive } from "../settlement/live.js";

export const specification = defineSpecification({
  requirement: "workspace/projections/native-regions-follow-planned-target",
  title: "Native Rule and Knowledge regions follow the planned instruction target",
  statement:
    "AXM shall create, replace or withdraw a named Rule or Knowledge region only in the instruction target planned by the selected scope's settings, resolved physically and contained within its native roots, and shall leave every other file, including one with a same-named fence, untouched. A region whose recorded generation is current shall not be rewritten, whatever its body now holds; a missing or stale row shall make AXM rewrite the region once and record its generation and written-body digest. AXM shall preserve the file's foreign content and line endings, append a new region at the end of the file, ignore fences inside fenced code, refuse duplicate, nested, interleaved or unpaired fences naming the region and the problem, and restore the precise insertion baseline only for an eligible new region followed by its unchanged withdrawal. Withdrawing an absent region shall converge by withdrawing its row, and a retarget shall withdraw the rows of the previous target without touching its bytes. Explicit adoption shall bind to unchanged observed bytes, record the region's current generation and body digest, and write no file.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition", "agent-interoperability"],
  boundary: "platform",
  boundaryRationale:
    "Physical aliases and exact instruction bytes require real temporary filesystem observations.",
  methods: ["example", "decision-table"],
  derivedFrom: ["cli/install/preserves-unrelated-and-unowned-state"],
  supersedes: ["workspace/projections/native-regions-preserve-scoped-authority"],
  assumptions: [],
  openQuestions: [],
});

const AGENTS_MD = ProjectionUnitPathSchema.make("AGENTS.md");
const GEN_A = projectionGeneration(["inputs a"]);
const GEN_B = projectionGeneration(["inputs b"]);

/** The row a change records, as the next reconciliation reads it back. */
const recordedAfter = (change: Option.Option<ProjectionRowChange>) =>
  Option.flatMap(change, ({ row }) =>
    row === undefined
      ? Option.none<RecordedProjectionRow>()
      : Option.some<RecordedProjectionRow>({ row, stale: false }),
  );

for (const kind of ["rules", "knowledge"] as const) {
  const owner: NativeRegionSource = {
    name: "guide",
    ref: `@acme/${kind}/guide`,
    root: `agent_extensions/registry.agentxm.ai/@acme/${kind}/guide`,
    scope: "project",
  };
  const baseArgs = (root: string): NativeManagedRegionArgs => ({
    workspaceRoot: root,
    ownerRoot: root,
    nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
    scope: "project",
    targetPath: `${root}/AGENTS.md`,
    displayPath: AGENTS_MD,
    region: kind,
    body: "Managed body",
    gen: GEN_A,
    recorded: Option.none(),
    contributors: [owner],
    ownership: [owner],
    configuredAgentIds: [],
    eligible: false,
  });

  describe(`${kind} native region`, () => {
    it.effect("creates a fenced region and reports it owned through the planned target", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = `${root}/AGENTS.md`;
        const authority = yield* makeRecordingNativeWriteAuthority;
        const args = baseArgs(root);
        const proposed = yield* reconcileNativeManagedRegion({ ...args, dryRun: true }).pipe(
          Effect.provide(authority.layer),
        );
        expect(proposed.nativeLocation).toMatchObject({ ownership: "absent", state: "created" });
        expect(proposed.nativeLocation.proof).toBeUndefined();
        expect(yield* fs.exists(file)).toBe(false);
        expect((yield* authority.observed).protectedPaths).toEqual([]);
        const applied = yield* reconcileNativeManagedRegion(args).pipe(
          Effect.provide(authority.layer),
        );
        expect(applied.nativeLocation).toMatchObject({
          ownership: "owned",
          state: "created",
          proof: "planned-instruction-target",
        });
        const bytes = yield* fs.readFileString(file);
        expect(bytes).toBe(`<!-- axm:${kind} -->\nManaged body\n<!-- /axm:${kind} -->\n`);
        expect(Option.getOrUndefined(applied.rowChange)).toEqual({
          kind,
          path: AGENTS_MD,
          row: { gen: GEN_A, output: projectionOutputDigest("Managed body\n") },
        });
        const current = yield* reconcileNativeManagedRegion({
          ...args,
          recorded: recordedAfter(applied.rowChange),
          dryRun: true,
        }).pipe(Effect.provide(authority.layer));
        expect(current.changed).toBe(false);
        expect(Option.isNone(current.rowChange)).toBe(true);
        expect(current.nativeLocation).toMatchObject({
          ownership: "owned",
          state: "unchanged",
          proof: "planned-instruction-target",
        });
        expect(yield* fs.readFileString(file)).toBe(bytes);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect("rewrites an unrecorded region once and records its row", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = `${root}/AGENTS.md`;
        const before = `# Notes\n\n<!-- axm:${kind} -->\nManaged body\n<!-- /axm:${kind} -->\n`;
        yield* fs.writeFileString(file, before);
        const authority = yield* makeRecordingNativeWriteAuthority;
        const first = yield* reconcileNativeManagedRegion(baseArgs(root)).pipe(
          Effect.provide(authority.layer),
        );
        expect(first.changed).toBe(true);
        expect(Option.getOrUndefined(first.lastWrite)).toBe("unrecorded");
        expect(yield* fs.readFileString(file)).toBe(before);
        const second = yield* reconcileNativeManagedRegion({
          ...baseArgs(root),
          recorded: recordedAfter(first.rowChange),
        }).pipe(Effect.provide(authority.layer));
        expect(second.changed).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect("keeps recorded currency portable between project checkouts", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const first = yield* fs.makeTempDirectoryScoped();
        const second = yield* fs.makeTempDirectoryScoped();
        const authority = yield* makeRecordingNativeWriteAuthority;
        const applied = yield* reconcileNativeManagedRegion({
          ...baseArgs(first),
          configuredAgentIds: ["codex"],
        }).pipe(Effect.provide(authority.layer));
        yield* fs.copyFile(`${first}/AGENTS.md`, `${second}/AGENTS.md`);
        const result = yield* reconcileNativeManagedRegion({
          ...baseArgs(second),
          configuredAgentIds: ["codex"],
          recorded: recordedAfter(applied.rowChange),
        }).pipe(Effect.provide(authority.layer));
        expect(result.changed).toBe(false);
        expect(result.nativeLocation.ownership).toBe("owned");
        expect(yield* fs.readFileString(`${second}/AGENTS.md`)).toBe(
          yield* fs.readFileString(`${first}/AGENTS.md`),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect("adopts an unchanged region by recording it, writing no file", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = `${root}/AGENTS.md`;
        const body = "Original body\r\nMixed line\n";
        const before = `# Foreign\r\n<!-- axm:${kind} -->\r\n${body}<!-- /axm:${kind} -->\r\nForeign tail`;
        yield* fs.writeFileString(file, before);
        const authority = yield* makeRecordingNativeWriteAuthority;
        const args = { ...baseArgs(root), gen: GEN_B, body: "Proposed canonical body" };
        const preview = yield* reconcileNativeManagedRegion({
          ...args,
          adoption: { expectedRaw: before },
          dryRun: true,
        }).pipe(Effect.provide(authority.layer));
        expect(preview.changed).toBe(false);
        expect(yield* fs.readFileString(file)).toBe(before);
        const adopted = yield* reconcileNativeManagedRegion({
          ...args,
          adoption: { expectedRaw: before },
        }).pipe(Effect.provide(authority.layer));
        expect(Option.getOrUndefined(adopted.rowChange)).toEqual({
          kind,
          path: AGENTS_MD,
          row: { gen: GEN_B, output: projectionOutputDigest(body) },
        });
        expect(yield* fs.readFileString(file)).toBe(before);
        expect((yield* authority.observed).protectedPaths).toEqual([]);
        expect(
          (yield* reconcileNativeManagedRegion({
            ...args,
            adoption: { expectedRaw: `${before}\nchanged` },
          }).pipe(Effect.provide(authority.layer), Effect.result))._tag,
        ).toBe("Failure");
        yield* fs.writeFileString(file, "# No region\n");
        expect(
          (yield* reconcileNativeManagedRegion({
            ...args,
            adoption: { expectedRaw: "# No region\n" },
          }).pipe(Effect.provide(authority.layer), Effect.result))._tag,
        ).toBe("Failure");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect("resolves an instruction alias through the captured user vendor root", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const home = path.join(root, "home");
        const vendor = path.join(root, "vendor");
        yield* fs.makeDirectory(home);
        yield* fs.makeDirectory(vendor);
        const target = path.join(vendor, "CLAUDE.md");
        yield* fs.writeFileString(target, "# Foreign\n");
        yield* fs.symlink(target, path.join(home, "AGENTS.md"));
        const proof: NativeRegionSource = { ...owner, scope: "user" };
        const authority = yield* makeRecordingNativeWriteAuthority;
        const args: NativeManagedRegionArgs = {
          ...baseArgs(home),
          nativeDirectoryInputs: {
            skillsDirectoryOverrides: {},
            userConfigRootOverrides: { "claude-code": vendor },
          },
          targetPath: target,
          contributors: [proof],
          ownership: [proof],
          configuredAgentIds: ["claude-code"],
        };
        expect(
          (yield* reconcileNativeManagedRegion({ ...args, scope: "project" }).pipe(
            Effect.provide(authority.layer),
            Effect.result,
          ))._tag,
        ).toBe("Failure");
        expect(yield* fs.readFileString(target)).toBe("# Foreign\n");
        const result = yield* reconcileNativeManagedRegion({ ...args, scope: "user" }).pipe(
          Effect.provide(authority.layer),
        );
        expect(result.nativeLocation.configuredConsumers).toEqual(["claude-code"]);
        expect(yield* fs.readLink(path.join(home, "AGENTS.md"))).toBe(target);
        expect(yield* fs.readFileString(target)).toContain("Managed body");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    for (const baseline of [undefined, "", "# Foreign instructions\r\n\r\n"]) {
      it.effect(
        `restores its ${baseline === undefined ? "absent" : baseline.length === 0 ? "empty" : "foreign-content"} insertion baseline`,
        () =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const root = yield* fs.makeTempDirectoryScoped();
            const file = `${root}/AGENTS.md`;
            if (baseline !== undefined) yield* fs.writeFileString(file, baseline);
            const authority = NativeWriteAuthorityLive.pipe(
              Layer.provide(
                Layer.merge(WorkspaceReadTest({ baseDir: root }), WorkspaceFileWriteLocksLive),
              ),
            );
            const args = { ...baseArgs(root), configuredAgentIds: ["codex"], eligible: true };
            const applied = yield* reconcileNativeManagedRegion(args).pipe(
              Effect.provide(authority),
            );
            const removed = yield* reconcileNativeManagedRegion({
              ...args,
              contributors: [],
              body: "",
              recorded: recordedAfter(applied.rowChange),
              eligible: false,
            }).pipe(Effect.provide(authority));
            expect(removed.nativeLocation.state).toBe("removed");
            expect(Option.getOrUndefined(removed.rowChange)).toEqual({
              kind,
              path: AGENTS_MD,
              row: undefined,
            });
            if (baseline === undefined) expect(yield* fs.exists(file)).toBe(false);
            else expect(yield* fs.readFileString(file)).toBe(baseline);
          }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
      );
    }

    it.effect("replaces a region whose contributors changed, whatever produced it before", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = `${root}/AGENTS.md`;
        const authority = yield* makeRecordingNativeWriteAuthority;
        const original = yield* reconcileNativeManagedRegion({
          ...baseArgs(root),
          body: "Original body",
        }).pipe(Effect.provide(authority.layer));
        const replacement = { ...owner, root: "another/source" };
        yield* reconcileNativeManagedRegion({
          ...baseArgs(root),
          contributors: [replacement],
          ownership: [replacement],
          body: "Replacement",
          gen: GEN_B,
          recorded: recordedAfter(original.rowChange),
        }).pipe(Effect.provide(authority.layer));
        expect(yield* fs.readFileString(file)).toBe(
          `<!-- axm:${kind} -->\nReplacement\n<!-- /axm:${kind} -->\n`,
        );
        const withdrawal = yield* reconcileNativeManagedRegion({
          ...baseArgs(root),
          contributors: [],
          ownership: [replacement],
          body: "",
        }).pipe(Effect.provide(authority.layer));
        expect(withdrawal.nativeLocation.state).toBe("removed");
        expect(yield* fs.readFileString(file)).toBe("");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect("compares a rewritten region's body with AXM's last write in a preview", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = `${root}/AGENTS.md`;
        const authority = yield* makeRecordingNativeWriteAuthority;
        const applied = yield* reconcileNativeManagedRegion(baseArgs(root)).pipe(
          Effect.provide(authority.layer),
        );
        const recorded = recordedAfter(applied.rowChange);
        const preview = (overrides: Partial<NativeManagedRegionArgs>) =>
          reconcileNativeManagedRegion({
            ...baseArgs(root),
            gen: GEN_B,
            body: "Next body",
            recorded,
            dryRun: true,
            ...overrides,
          }).pipe(
            Effect.provide(authority.layer),
            Effect.map(({ lastWrite }) => Option.getOrUndefined(lastWrite)),
          );
        expect(yield* preview({})).toBe("matches");
        expect(yield* preview({ recorded: Option.none() })).toBe("unrecorded");
        expect(yield* preview({ body: "" })).toBe("matches");
        yield* fs.writeFileString(file, `<!-- axm:${kind} -->\nHand edit\n<!-- /axm:${kind} -->\n`);
        expect(yield* preview({})).toBe("modified");
        expect(yield* preview({ body: "" })).toBe("modified");
        // A lagging recorded output never flags a body that already equals the render.
        expect(yield* preview({ body: "Hand edit" })).toBe("matches");
        expect(
          Option.getOrUndefined(
            (yield* reconcileNativeManagedRegion({ ...baseArgs(root), dryRun: true }).pipe(
              Effect.provide(authority.layer),
            )).lastWrite,
          ),
        ).toBe("unrecorded");
        yield* fs.remove(file);
        expect(yield* preview({})).toBeUndefined();
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect("refuses contributors without accepted source authority before any write", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();
        const authority = yield* makeRecordingNativeWriteAuthority;
        const stranger = { ...owner, root: "unaccepted/source" };
        const result = yield* reconcileNativeManagedRegion({
          ...baseArgs(root),
          contributors: [stranger],
        }).pipe(Effect.provide(authority.layer), Effect.result);
        expect(result._tag).toBe("Failure");
        expect(yield* fs.exists(`${root}/AGENTS.md`)).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect("preserves mixed foreign line endings and formatter output of a current body", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = `${root}/AGENTS.md`;
        const prefix = "# Foreign\r\nLF paragraph\n";
        const suffix = "\nForeign tail\r\n";
        yield* fs.writeFileString(file, prefix);
        const authority = yield* makeRecordingNativeWriteAuthority;
        const first = yield* reconcileNativeManagedRegion({
          ...baseArgs(root),
          body: "Original managed body",
        }).pipe(Effect.provide(authority.layer));
        yield* fs.writeFileString(file, (yield* fs.readFileString(file)) + suffix);
        const second = yield* reconcileNativeManagedRegion({
          ...baseArgs(root),
          gen: GEN_B,
          body: "Expected managed body",
          recorded: recordedAfter(first.rowChange),
        }).pipe(Effect.provide(authority.layer));
        expect(Option.getOrUndefined(second.lastWrite)).toBe("matches");
        const beforeRewrite = yield* fs.readFileString(file);
        expect(beforeRewrite.startsWith(prefix)).toBe(true);
        expect(beforeRewrite.endsWith(suffix)).toBe(true);
        expect(beforeRewrite).toContain("\r\nExpected managed body\r\n");
        const rewritten = beforeRewrite.replace(
          "Expected managed body",
          "Repository formatter output",
        );
        yield* fs.writeFileString(file, rewritten);
        const current = yield* reconcileNativeManagedRegion({
          ...baseArgs(root),
          gen: GEN_B,
          body: "Expected managed body",
          recorded: recordedAfter(second.rowChange),
        }).pipe(Effect.provide(authority.layer));
        expect(current.changed).toBe(false);
        expect(yield* fs.readFileString(file)).toBe(rewritten);
        const edited = yield* reconcileNativeManagedRegion({
          ...baseArgs(root),
          body: "Changed inputs",
          recorded: recordedAfter(second.rowChange),
          dryRun: true,
        }).pipe(Effect.provide(authority.layer));
        expect(Option.getOrUndefined(edited.lastWrite)).toBe("modified");
        yield* reconcileNativeManagedRegion({
          ...baseArgs(root),
          contributors: [],
          body: "",
        }).pipe(Effect.provide(authority.layer));
        expect(yield* fs.readFileString(file)).toBe(prefix + suffix);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect("preserves a current body rewrite without renewing its absent-file inverse", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = `${root}/AGENTS.md`;
        const authority = NativeWriteAuthorityLive.pipe(
          Layer.provide(
            Layer.merge(WorkspaceReadTest({ baseDir: root }), WorkspaceFileWriteLocksLive),
          ),
        );
        const applied = yield* reconcileNativeManagedRegion({
          ...baseArgs(root),
          body: "Generated body",
          eligible: true,
        }).pipe(Effect.provide(authority));
        const rewritten = (yield* fs.readFileString(file)).replace(
          "Generated body",
          "Repository formatter output",
        );
        yield* fs.writeFileString(file, rewritten);
        expect(
          (yield* reconcileNativeManagedRegion({
            ...baseArgs(root),
            body: "Generated body",
            recorded: recordedAfter(applied.rowChange),
          }).pipe(Effect.provide(authority))).changed,
        ).toBe(false);
        expect(yield* fs.readFileString(file)).toBe(rewritten);
        yield* reconcileNativeManagedRegion({
          ...baseArgs(root),
          contributors: [],
          body: "",
        }).pipe(Effect.provide(authority));
        expect(yield* fs.exists(file)).toBe(true);
        expect(yield* fs.readFileString(file)).toBe("");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect("converges when withdrawing an absent region by withdrawing its row", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = `${root}/AGENTS.md`;
        yield* fs.writeFileString(file, "# Hand-cleaned\n");
        const authority = yield* makeRecordingNativeWriteAuthority;
        const recorded = Option.some<RecordedProjectionRow>({
          row: { gen: GEN_A, output: projectionOutputDigest("Managed body\n") },
          stale: false,
        });
        const withdrawn = yield* reconcileNativeManagedRegion({
          ...baseArgs(root),
          contributors: [],
          body: "",
          recorded,
        }).pipe(Effect.provide(authority.layer));
        expect(withdrawn.changed).toBe(false);
        expect(withdrawn.nativeLocation.state).toBe("absent");
        expect(Option.getOrUndefined(withdrawn.rowChange)).toEqual({
          kind,
          path: AGENTS_MD,
          row: undefined,
        });
        const settled = yield* reconcileNativeManagedRegion({
          ...baseArgs(root),
          contributors: [],
          body: "",
        }).pipe(Effect.provide(authority.layer));
        expect(Option.isNone(settled.rowChange)).toBe(true);
        expect(yield* fs.readFileString(file)).toBe("# Hand-cleaned\n");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect("ignores a fence inside fenced code and leaves other files' fences alone", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = `${root}/AGENTS.md`;
        const readme = `${root}/README.md`;
        const example = `# Guide\n\n\`\`\`markdown\n<!-- axm:${kind} -->\nexample\n<!-- /axm:${kind} -->\n\`\`\`\n`;
        const foreign = `<!-- axm:${kind} -->\nNot AXM's\n<!-- /axm:${kind} -->\n`;
        yield* fs.writeFileString(file, example);
        yield* fs.writeFileString(readme, foreign);
        const authority = yield* makeRecordingNativeWriteAuthority;
        const applied = yield* reconcileNativeManagedRegion(baseArgs(root)).pipe(
          Effect.provide(authority.layer),
        );
        expect(applied.nativeLocation.state).toBe("created");
        expect(yield* fs.readFileString(file)).toBe(
          `${example}<!-- axm:${kind} -->\nManaged body\n<!-- /axm:${kind} -->\n`,
        );
        expect(yield* fs.readFileString(readme)).toBe(foreign);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    for (const [problem, content] of [
      ["unpaired", `<!-- axm:${kind} -->\nbody\n`],
      [
        "duplicate",
        `<!-- axm:${kind} -->\na\n<!-- /axm:${kind} -->\n<!-- axm:${kind} -->\nb\n<!-- /axm:${kind} -->\n`,
      ],
      [
        "nested",
        `<!-- axm:${kind} -->\n<!-- axm:${kind} -->\n<!-- /axm:${kind} -->\n<!-- /axm:${kind} -->\n`,
      ],
      [
        "interleaved",
        `<!-- axm:${kind} -->\n<!-- axm:instruction-aliases -->\n<!-- /axm:${kind} -->\n<!-- /axm:instruction-aliases -->\n`,
      ],
    ] as const) {
      it.effect(`refuses ${problem} fences and names the region`, () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const root = yield* fs.makeTempDirectoryScoped();
          const file = `${root}/AGENTS.md`;
          yield* fs.writeFileString(file, content);
          const authority = yield* makeRecordingNativeWriteAuthority;
          const result = yield* reconcileNativeManagedRegion(baseArgs(root)).pipe(
            Effect.provide(authority.layer),
            Effect.flip,
          );
          expect(result).toMatchObject({
            _tag: "ManagedRegionViolation",
            displayPath: "AGENTS.md",
            reasonCode: "managed-region-malformed",
            region: kind,
            problem,
          });
          expect(yield* fs.readFileString(file)).toBe(content);
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
      );
    }

    it.effect("withdraws the rows of a previous target without touching its bytes", () =>
      Effect.sync(() => {
        const claude = ProjectionUnitPathSchema.make("CLAUDE.md");
        const rows = new Map([
          [AGENTS_MD, { row: { gen: GEN_A, output: GEN_A }, stale: false }],
          [claude, { row: { gen: GEN_B, output: GEN_B }, stale: false }],
        ]);
        expect(retargetedRegionRows(kind, rows, claude)).toEqual([
          { kind, path: AGENTS_MD, row: undefined },
        ]);
        expect(retargetedRegionRows(kind, rows, AGENTS_MD)).toEqual([
          { kind, path: claude, row: undefined },
        ]);
      }),
    );

    it.effect("refuses an alias retargeted while waiting for the native write lock", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const originalFile = path.join(root, "original.md");
        const replacementFile = path.join(root, "replacement.md");
        const alias = path.join(root, "AGENTS.md");
        yield* fs.writeFileString(originalFile, "# Original\n");
        yield* fs.writeFileString(replacementFile, "# Replacement\n");
        yield* fs.symlink("original.md", alias);
        const recording = yield* makeRecordingNativeWriteAuthority;
        const retargetingAuthority = Layer.effect(
          NativeWriteAuthority,
          Effect.map(NativeWriteAuthority, (authority) =>
            NativeWriteAuthority.of({
              ...authority,
              withExclusiveWrite: (target, effect) =>
                authority.withExclusiveWrite(
                  target,
                  fs.remove(alias).pipe(
                    Effect.andThen(fs.symlink("replacement.md", alias)),
                    Effect.mapError((cause) => new NativeWriteRefused({ path: target, cause })),
                    Effect.andThen(effect),
                  ),
                ),
            }),
          ),
        ).pipe(Layer.provide(recording.layer));
        const result = yield* reconcileNativeManagedRegion({
          ...baseArgs(root),
          targetPath: originalFile,
          eligible: true,
        }).pipe(Effect.provide(retargetingAuthority), Effect.result);
        expect(result._tag).toBe("Failure");
        expect(yield* fs.readFileString(originalFile)).toBe("# Original\n");
        expect(yield* fs.readFileString(replacementFile)).toBe("# Replacement\n");
        expect((yield* recording.observed).protectedPaths).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect("refuses an instruction alias into its contributor source before mutation", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, owner.root, "src/index.md");
        yield* fs.makeDirectory(path.dirname(source), { recursive: true });
        yield* fs.writeFileString(source, "# Source\n");
        yield* fs.symlink(source, path.join(root, "AGENTS.md"));
        const authority = yield* makeRecordingNativeWriteAuthority;
        expect(
          (yield* reconcileNativeManagedRegion({
            ...baseArgs(root),
            targetPath: source,
            eligible: true,
          }).pipe(Effect.provide(authority.layer), Effect.result))._tag,
        ).toBe("Failure");
        expect(yield* fs.readFileString(source)).toBe("# Source\n");
        expect((yield* authority.observed).protectedPaths).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  });
}
