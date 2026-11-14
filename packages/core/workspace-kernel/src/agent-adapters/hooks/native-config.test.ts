import * as NodeServices from "@effect/platform-node/NodeServices";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Result from "effect/Result";
import type * as Scope from "effect/Scope";
import { workObservations } from "../../locations/testing.js";
import { withNativeConfigReadView } from "../native-config-syntax.js";
import { NativeWriteAuthorityPermissive } from "../testing.js";
import type { HookNativeDeclaration } from "./managed-groups.js";
import { reconcileNativeHookConfig, type NativeHookConfigArgs } from "./native-config.js";

const foreignGroup = { hooks: [{ type: "command", command: "node /opt/foreign/handler.js" }] };

const ownerGroup = (owner: HookNativeDeclaration) => ({
  hooks: [{ type: "command", command: `node '${owner.root}/src/handler.js'` }],
});

const settings = (hooks: Readonly<Record<string, unknown>>) =>
  `${JSON.stringify({ hooks }, null, 2)}\n`;

/**
 * A real `.claude/settings.json` under a temporary workspace. Every run goes
 * through one recording filesystem so content reads of the target are counted.
 */
const makeFixture = Effect.gen(function* () {
  const base = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* base.realPath(yield* base.makeTempDirectoryScoped());
  const file = path.join(root, ".claude", "settings.json");
  yield* base.makeDirectory(path.dirname(file), { recursive: true });
  const { fileSystem, recording } = makeRecordingFileSystem(base);
  const owner = (name: string): HookNativeDeclaration => ({
    name,
    ref: `@test/hooks/${name}`,
    scope: "project",
    root: path.join(root, "hooks", name),
  });
  const args = (
    overrides: Pick<NativeHookConfigArgs, "rendered" | "declarations"> &
      Partial<NativeHookConfigArgs>,
  ): NativeHookConfigArgs => ({
    workspaceRoot: root,
    ownerRoot: root,
    nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
    scope: "project",
    path: file,
    aliases: [file],
    consumers: ["claude-code"],
    configuredAgentIds: ["claude-code"],
    settingsKey: "hooks",
    format: "json",
    ...overrides,
  });
  /** Run with fresh accounting: executed native parses and content reads of the target. */
  const measure = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const observations = workObservations(false);
      recording.reset();
      const result = yield* effect.pipe(
        observations.provide,
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.result,
      );
      return {
        result,
        parses: observations.facts.filter(({ kind }) => kind === "axm.parse.native").length,
        /** Structured edits applied by each native document render, in completion order. */
        renders: observations.facts.flatMap(({ kind, attributes }) =>
          kind === "axm.render.native" ? [attributes["axm.work.count"]] : [],
        ),
        contentReads: recording.contentReads(file),
      };
    });
  const reconcile = (input: NativeHookConfigArgs) =>
    reconcileNativeHookConfig(input).pipe(Effect.provide(NativeWriteAuthorityPermissive));
  const write = (content: string) => base.writeFileString(file, content);
  const contents = base.readFileString(file);
  return { root, file, owner, args, measure, reconcile, write, contents, base };
});

/** What a caller can observe of one run, with the temporary root spelled `<root>`. */
const outcomeOf = <A, E extends { readonly _tag: string }>(
  root: string,
  result: Result.Result<A, E>,
): unknown => {
  const value = Result.isSuccess(result)
    ? { success: result.success }
    : {
        failure: result.failure._tag,
        ...("detail" in result.failure ? { detail: result.failure.detail } : {}),
      };
  return JSON.parse(JSON.stringify(value).replaceAll(root, "<root>"));
};

const scoped = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Scope.Scope>,
) => effect.pipe(Effect.scoped, Effect.provide(NodeServices.layer));

describe("native Hook configuration runs", () => {
  it.effect("parses each exact document once per dry run, apply and absent target", () =>
    scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const audit = fixture.owner("audit");
        const current = settings({ PreToolUse: [ownerGroup(audit), foreignGroup] });
        yield* fixture.write(current);

        const withdrawal = fixture.args({ rendered: {}, declarations: [audit] });
        const withdrawn = yield* fixture.measure(
          fixture.reconcile({ ...withdrawal, dryRun: true }),
        );
        expect(withdrawn.result).toMatchObject({
          success: { changed: true, declaredNames: ["audit"] },
        });

        const unchanged = yield* fixture.measure(
          fixture.reconcile(
            fixture.args({
              rendered: { PreToolUse: [ownerGroup(audit)] },
              declarations: [audit],
              dryRun: true,
            }),
          ),
        );
        expect(unchanged.result).toMatchObject({
          success: { changed: false, observedNames: ["audit"] },
        });

        yield* fixture.write(settings({ PreToolUse: [foreignGroup] }));
        const foreignOnly = yield* fixture.measure(
          fixture.reconcile(fixture.args({ rendered: {}, declarations: [], dryRun: true })),
        );
        expect(foreignOnly.result).toMatchObject({
          success: { nativeLocation: { ownership: "unowned", state: "retained" } },
        });

        yield* fixture.base.remove(fixture.file);
        const absent = yield* fixture.measure(
          fixture.reconcile(
            fixture.args({
              rendered: { PreToolUse: [ownerGroup(audit)] },
              declarations: [audit],
              dryRun: true,
            }),
          ),
        );
        expect(absent.result).toMatchObject({
          success: { changed: true, nativeLocation: { state: "created" } },
        });

        yield* fixture.write(current);
        const applied = yield* fixture.measure(fixture.reconcile(withdrawal));
        expect(applied.result).toMatchObject({
          success: { changed: true, nativeLocation: { state: "removed" } },
        });
        expect(yield* fixture.contents).toBe(settings({ PreToolUse: [foreignGroup] }));
        // One render each, removing the owner's single group.
        expect({ withdrawn: withdrawn.renders, applied: applied.renders }).toEqual({
          withdrawn: [1],
          applied: [1],
        });
        const counted = { withdrawn, unchanged, foreignOnly, absent, applied };
        expect(
          Object.fromEntries(
            Object.entries(counted).map(([run, { parses, contentReads }]) => [
              run,
              { parses, contentReads },
            ]),
          ),
        ).toEqual({
          withdrawn: { parses: 4, contentReads: 1 },
          unchanged: { parses: 2, contentReads: 1 },
          foreignOnly: { parses: 2, contentReads: 1 },
          absent: { parses: 3, contentReads: 1 },
          applied: { parses: 4, contentReads: 2 },
        });
      }),
    ),
  );

  it.effect("joins an enclosing read view instead of opening its own", () =>
    scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const audit = fixture.owner("audit");
        yield* fixture.write(settings({ PreToolUse: [ownerGroup(audit), foreignGroup] }));
        const preview = fixture.reconcile(
          fixture.args({ rendered: {}, declarations: [audit], dryRun: true }),
        );
        const measured = yield* fixture.measure(
          withNativeConfigReadView(
            Effect.gen(function* () {
              const first = yield* fixture.measure(preview);
              const second = yield* fixture.measure(preview);
              return [first.parses, second.parses];
            }),
          ),
        );
        expect(measured.result).toEqual(Result.succeed([4, 0]));
      }),
    ),
  );

  it.effect("parses a locked apply afresh inside an enclosing read view", () =>
    scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const audit = fixture.owner("audit");
        yield* fixture.write(settings({ PreToolUse: [ownerGroup(audit), foreignGroup] }));
        const args = fixture.args({ rendered: {}, declarations: [audit] });
        const measured = yield* fixture.measure(
          withNativeConfigReadView(
            Effect.gen(function* () {
              const preview = yield* fixture.measure(fixture.reconcile({ ...args, dryRun: true }));
              const applied = yield* fixture.measure(fixture.reconcile(args));
              return [preview, applied].map(({ parses, contentReads }) => ({
                parses,
                contentReads,
              }));
            }),
          ),
        );
        // The publication never reuses the preview's results, even for the same text.
        expect(measured.result).toEqual(
          Result.succeed([
            { parses: 4, contentReads: 1 },
            { parses: 4, contentReads: 2 },
          ]),
        );
        expect(yield* fixture.contents).toBe(settings({ PreToolUse: [foreignGroup] }));
      }),
    ),
  );

  it.effect(
    "keeps each context's outcome for documents whose __proto__ member sets a prototype",
    () =>
      scoped(
        Effect.gen(function* () {
          const fixture = yield* makeFixture;
          const audit = fixture.owner("audit");
          const rendered = { PreToolUse: [ownerGroup(audit)] };
          const unsupported = {
            failure: "HookConfigInvalid",
            detail: "Unsupported native Hook config version in <root>/.claude/settings.json",
          };
          const invalidStructure = {
            failure: "HookConfigInvalid",
            detail: "Invalid hook event/group structure: <root>/.claude/settings.json",
          };
          const versioned = '{"__proto__":{"version":2}}\n';
          const cases = [
            {
              raw: versioned,
              args: fixture.args({ rendered, declarations: [audit], configVersion: 1 }),
              // Without a view the parsed prototype supplies `version`; inside a read view it does not.
              expected: [
                unsupported,
                { changed: true, ownership: "declared", state: "updated" },
                unsupported,
                { changed: true, ownership: "declared", state: "updated" },
              ],
              written: [
                versioned,
                versioned,
                versioned,
                // JSON.parse keeps `__proto__` as an own key, so this spells the edited document.
                `${JSON.stringify(
                  JSON.parse(
                    `{"__proto__":{"version":2},"version":1,"hooks":${JSON.stringify(rendered)}}`,
                  ),
                  null,
                  2,
                )}\n`,
              ],
            },
            {
              raw: '{"__proto__":{"hooks":{"PreToolUse":"x"}}}\n',
              args: fixture.args({ rendered: {}, declarations: [audit] }),
              expected: [
                invalidStructure,
                { changed: false, ownership: "declared", state: "absent" },
                invalidStructure,
                { changed: false, ownership: "declared", state: "absent" },
              ],
            },
            {
              raw: '{"__proto__":{"hooks":{}}}\n',
              args: fixture.args({ rendered: {}, declarations: [] }),
              expected: [
                { changed: false, ownership: "unowned", state: "retained" },
                { changed: false, ownership: "absent", state: "absent" },
                { changed: false, ownership: "unowned", state: "retained" },
                { changed: false, ownership: "absent", state: "absent" },
              ],
            },
          ];
          for (const { raw, args, expected, written } of cases) {
            const contexts = [
              fixture.reconcile({ ...args, dryRun: true }),
              withNativeConfigReadView(fixture.reconcile({ ...args, dryRun: true })),
              fixture.reconcile(args),
              withNativeConfigReadView(fixture.reconcile(args)),
            ];
            const outcomes: Array<unknown> = [];
            const bytes: Array<string> = [];
            for (const run of contexts) {
              yield* fixture.write(raw);
              const { result } = yield* fixture.measure(run);
              outcomes.push(
                Result.isSuccess(result)
                  ? {
                      changed: result.success.changed,
                      ownership: result.success.nativeLocation.ownership,
                      state: result.success.nativeLocation.state,
                    }
                  : outcomeOf(fixture.root, result),
              );
              bytes.push(yield* fixture.contents);
            }
            expect(outcomes).toEqual(expected);
            expect(bytes).toEqual(written ?? [raw, raw, raw, raw]);
          }
        }),
      ),
  );

  it.effect("maps each consumer's parse failure through its own vocabulary", () =>
    scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const audit = fixture.owner("audit");
        const args = fixture.args({ rendered: {}, declarations: [audit] });
        yield* fixture.write("{ invalid\n");
        for (const run of [fixture.reconcile({ ...args, dryRun: true }), fixture.reconcile(args)]) {
          const { result } = yield* fixture.measure(run);
          expect(outcomeOf(fixture.root, result)).toEqual({
            failure: "HookConfigInvalid",
            detail: "Invalid native hooks config JSON/JSONC: <root>/.claude/settings.json",
          });
        }
        // The JSONC writer accepts the comment; Claude Code's strict JSON reader does not.
        yield* fixture.write('{\n  // comment\n  "hooks": {}\n}\n');
        for (const run of [
          fixture.reconcile({ ...args, format: "jsonc", dryRun: true }),
          fixture.reconcile({ ...args, format: "jsonc" }),
        ]) {
          const { result } = yield* fixture.measure(run);
          expect(outcomeOf(fixture.root, result)).toEqual({
            failure: "HookConfigInvalid",
            detail: "Native readers cannot share Hook configuration: <root>/.claude/settings.json",
          });
        }
        expect(yield* fixture.contents).toBe('{\n  // comment\n  "hooks": {}\n}\n');
      }),
    ),
  );

  it.effect("parses a foreign edit made after the dry run before applying", () =>
    scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const audit = fixture.owner("audit");
        const args = fixture.args({ rendered: {}, declarations: [audit] });
        yield* fixture.write(settings({ PreToolUse: [ownerGroup(audit), foreignGroup] }));
        yield* fixture.measure(fixture.reconcile({ ...args, dryRun: true }));
        yield* fixture.write(
          settings({ PreToolUse: [ownerGroup(audit), foreignGroup, foreignGroup] }),
        );
        const applied = yield* fixture.measure(fixture.reconcile(args));
        expect(yield* fixture.contents).toBe(
          settings({ PreToolUse: [foreignGroup, foreignGroup] }),
        );
        expect(applied).toMatchObject({ parses: 4, contentReads: 2 });
        yield* fixture.write(settings({ PreToolUse: "x" }));
        const refused = yield* fixture.measure(fixture.reconcile(args));
        expect(outcomeOf(fixture.root, refused.result)).toEqual({
          failure: "HookConfigInvalid",
          detail: "Invalid hook event/group structure: <root>/.claude/settings.json",
        });
      }),
    ),
  );

  it.effect("leaves nothing shared behind a run whose write fails", () =>
    scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const audit = fixture.owner("audit");
        const args = fixture.args({ rendered: {}, declarations: [audit] });
        const raw = settings({ PreToolUse: [ownerGroup(audit), foreignGroup] });
        yield* fixture.write(raw);
        const fs = yield* FileSystem.FileSystem;
        const failingFs = {
          ...fs,
          writeFileString: (path, data, options) =>
            path === fixture.file
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "PermissionDenied",
                    module: "FileSystem",
                    method: "writeFileString",
                    pathOrDescriptor: path,
                  }),
                )
              : fs.writeFileString(path, data, options),
        } satisfies FileSystem.FileSystem;
        const failed = yield* fixture.measure(
          fixture.reconcile(args).pipe(Effect.provideService(FileSystem.FileSystem, failingFs)),
        );
        expect(outcomeOf(fixture.root, failed.result)).toEqual({
          failure: "HookIoFailed",
          detail: "Cannot write hooks configuration: <root>/.claude/settings.json",
        });
        expect(yield* fixture.contents).toBe(raw);
        const next = yield* fixture.measure(fixture.reconcile({ ...args, dryRun: true }));
        expect(Result.isSuccess(next.result)).toBe(true);
        expect({ failed: failed.parses, next: next.parses }).toEqual({ failed: 4, next: 4 });
      }),
    ),
  );

  it.effect("renders an unchanged apply once and keeps per-owner observation for dry runs", () =>
    scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const audit = fixture.owner("audit");
        const review = fixture.owner("review");
        const raw = settings({ PreToolUse: [ownerGroup(audit), ownerGroup(review), foreignGroup] });
        yield* fixture.write(raw);
        const args = fixture.args({
          rendered: { PreToolUse: [ownerGroup(audit), ownerGroup(review)] },
          declarations: [audit, review],
        });
        const preview = yield* fixture.measure(fixture.reconcile({ ...args, dryRun: true }));
        const applied = yield* fixture.measure(fixture.reconcile(args));
        expect(preview.result).toMatchObject({
          success: { changed: false, observedNames: ["audit", "review"] },
        });
        expect(applied.result).toMatchObject({
          success: { changed: false, nativeLocation: { state: "unchanged" } },
        });
        expect(yield* fixture.contents).toBe(raw);
        // The all-owner render, then one per observed owner; none of them edits.
        expect({ preview: preview.renders, applied: applied.renders }).toEqual({
          preview: [0, 0, 0],
          applied: [0],
        });
      }),
    ),
  );

  it.effect("applies an added owner and a repeated apply with today's bytes and outcome", () =>
    scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const audit = fixture.owner("audit");
        const review = fixture.owner("review");
        yield* fixture.write(settings({ PreToolUse: [ownerGroup(audit), foreignGroup] }));
        const args = fixture.args({
          rendered: { PreToolUse: [ownerGroup(audit), ownerGroup(review)] },
          declarations: [audit, review],
        });
        const configured = settings({
          PreToolUse: [ownerGroup(audit), ownerGroup(review), foreignGroup],
        });
        const location = {
          scope: "project",
          address: {
            kind: "hook-registrations",
            path: fixture.file,
            settingsKey: "hooks",
            scriptRoots: [audit.root, review.root],
          },
          aliases: [fixture.file],
          configuredConsumers: ["claude-code"],
          potentialReaders: [],
          policyReasons: [],
          ownership: "declared",
          proof: "effective-native-declaration",
          mechanism: "structured-entry",
          availability: [
            {
              agentId: "claude-code",
              state: "unverified",
              reason:
                "Native Hook readback verifies content; running-agent configuration selection is not observed.",
            },
          ],
        };
        const first = yield* fixture.measure(fixture.reconcile(args));
        expect(first.result).toMatchObject({
          success: {
            changed: true,
            declaredNames: ["audit"],
            expectedNames: ["audit", "review"],
            nativeLocation: { ...location, state: "updated" },
          },
        });
        expect(yield* fixture.contents).toBe(configured);
        const again = yield* fixture.measure(fixture.reconcile(args));
        expect(again.result).toMatchObject({
          success: {
            changed: false,
            declaredNames: ["audit", "review"],
            expectedNames: ["audit", "review"],
            nativeLocation: { ...location, state: "unchanged" },
          },
        });
        expect(yield* fixture.contents).toBe(configured);
        expect(again.contentReads).toBe(1);
        // The owner's group is removed, then both owners' groups are inserted; a current file needs no edit.
        expect({ first: first.renders, again: again.renders }).toEqual({
          first: [3],
          again: [0],
        });
      }),
    ),
  );
});
