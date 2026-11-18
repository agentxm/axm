/**
 * Publication verification against foreign changes that land between a
 * writer's publication and its recording. Real temporary files supply the
 * identities that verification compares; each foreign change is injected by
 * the publication callback before it delegates to `recordFilePublication`.
 */
import { describe, expect, it } from "@effect/vitest";
import { writeFileAtomic } from "@agentxm/host-primitives";
import { CurrentWorkObserver, type WorkObserver } from "@agentxm/host-primitives/work-observation";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";

import { resolveNativeReferent } from "../locations/index.js";
import { CanonicalNativePathLive } from "../locations/live.js";
import { NativePlatformTest } from "../locations/testing.js";
import { WorkspaceSnapshotError } from "./errors.js";
import {
  FootprintRecorder,
  makeFootprintRecorder,
  recordFilePublication,
  runWorkspaceTransaction,
} from "./index.js";
import { WorkspaceTransactionScopeTest } from "./testing.js";

const platform = Layer.merge(NativePlatformTest, CanonicalNativePathLive);
const privileged = process.platform === "win32" || process.getuid?.() === 0;

interface Fixture {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly root: string;
  readonly file: string;
}

/**
 * Publish `content` to `<root>/P/target.txt` (preimage `before\n`) inside a
 * transaction, apply `interfere` between publication and recording, then fail
 * the transition so rollback runs against whatever was recorded.
 */
const publishWithInterference = (
  content: string | Uint8Array,
  interfere: (fixture: Fixture) => Effect.Effect<void, unknown>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs
      .makeTempDirectoryScoped({ prefix: "axm-publication-verification-" })
      .pipe(Effect.flatMap(resolveNativeReferent));
    yield* fs.makeDirectory(path.join(root, ".axm"));
    yield* fs.makeDirectory(path.join(root, "P"));
    const file = path.join(root, "P", "target.txt");
    yield* fs.writeFileString(file, "before\n");
    const fixture: Fixture = { fs, path, root, file };
    const footprint = yield* makeFootprintRecorder;
    let verificationHashes = 0;
    const observer: WorkObserver = {
      record: (fact, parent) => {
        if (
          fact.kind === "axm.hash.preimage" &&
          parent?._tag === "Span" &&
          parent.name === "axm.verify.publication"
        )
          verificationHashes += 1;
      },
      detailSelected: () => false,
    };
    const recorded = yield* Ref.make<Option.Option<WorkspaceSnapshotError>>(Option.none());
    const outcome = yield* runWorkspaceTransaction({
      claimDefaultTargets: false,
      targets: [file],
      transition: Effect.gen(function* () {
        yield* writeFileAtomic(fs, {
          targetPath: file,
          content,
          mapError: ({ cause }) => cause,
          onPublished: (publication) =>
            interfere(fixture).pipe(
              Effect.orDie,
              Effect.andThen(
                recordFilePublication({ path: file, change: "modified" }, publication),
              ),
              Effect.tapError((error) => Ref.set(recorded, Option.some(error))),
            ),
        });
        return yield* Effect.fail("later-step-failed" as const);
      }),
      validate: () => Effect.void,
    }).pipe(
      Effect.provide(
        WorkspaceTransactionScopeTest({
          workspaceDir: path.join(root, ".axm"),
          settingsPath: path.join(root, "axm.json"),
          lockPath: path.join(root, "axm.lock"),
        }),
      ),
      Effect.provideService(FootprintRecorder, footprint),
      Effect.provideService(CurrentWorkObserver, observer),
      Effect.flip,
    );
    return {
      ...fixture,
      outcome,
      refusal: yield* Ref.get(recorded),
      footprint: yield* Ref.get(footprint.ref),
      verificationHashes,
    };
  });

/** Unrecorded bytes never become rollback authority: rollback retains the target. */
const expectRefusedAndRetained = Effect.fnUntraced(function* (
  result: Effect.Success<ReturnType<typeof publishWithInterference>>,
  cause: "publication-changed-before-recording" | "publication-route-unresolvable",
) {
  expect(Option.map(result.refusal, ({ step, cause }) => ({ step, cause }))).toEqual(
    Option.some({ step: "verify-publication", cause }),
  );
  expect(result.footprint).toEqual([]);
  const outcome = result.outcome;
  if (typeof outcome === "string" || outcome._tag !== "WorkspaceRestorationIncomplete")
    return expect.fail("Expected retained recovery evidence");
  const transition = Option.getOrUndefined(Cause.findErrorOption(outcome.transitionCause));
  expect(transition).toBeInstanceOf(WorkspaceSnapshotError);
  expect(outcome.retained).toEqual([result.path.join("P", "target.txt")]);
  expect(outcome.recovery.map((entry) => [entry.kind, entry.originalPath])).toEqual([
    ["snapshot", result.file],
  ]);
  const recovery = outcome.recovery[0];
  if (recovery !== undefined)
    expect(yield* result.fs.readFileString(recovery.recoveryPath)).toBe("before\n");
  if (outcome.snapshotDir !== undefined)
    yield* result.fs.remove(outcome.snapshotDir, { recursive: true });
});

describe("file publication verification", () => {
  it.effect("refuses an in-place foreign edit that prepends a byte-order mark", () =>
    Effect.gen(function* () {
      const marked = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("after\n")]);
      const result = yield* publishWithInterference("after\n", ({ fs, file }) =>
        fs.writeFile(file, marked),
      );
      yield* expectRefusedAndRetained(result, "publication-changed-before-recording");
      expect(Buffer.from(yield* result.fs.readFile(result.file)).equals(marked)).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("refuses the same bytes republished through a new entry", () =>
    Effect.gen(function* () {
      const result = yield* publishWithInterference("after\n", ({ fs, file }) =>
        Effect.gen(function* () {
          yield* fs.writeFileString(`${file}.foreign`, "after\n");
          yield* fs.rename(`${file}.foreign`, file);
        }),
      );
      yield* expectRefusedAndRetained(result, "publication-changed-before-recording");
      expect(yield* result.fs.readFileString(result.file)).toBe("after\n");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("refuses an in-place foreign edit of the same length", () =>
    Effect.gen(function* () {
      const result = yield* publishWithInterference("after\n", ({ fs, file }) =>
        fs.writeFileString(file, "AFTER\n"),
      );
      yield* expectRefusedAndRetained(result, "publication-changed-before-recording");
      expect(yield* result.fs.readFileString(result.file)).toBe("AFTER\n");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("refuses same-length invalid UTF-8 bytes in place of a replacement character", () =>
    Effect.gen(function* () {
      // Five bytes, like the encoded "a�b", and decoded to the same text.
      const foreign = [0x61, 0xf0, 0x9f, 0x98, 0x62];
      const result = yield* publishWithInterference("a�b", ({ fs, file }) =>
        fs.writeFile(file, Uint8Array.from(foreign)),
      );
      yield* expectRefusedAndRetained(result, "publication-changed-before-recording");
      expect([...(yield* result.fs.readFile(result.file))]).toEqual(foreign);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("records byte content that round-trips and restores its preimage", () =>
    Effect.gen(function* () {
      const result = yield* publishWithInterference(
        Uint8Array.from([0x00, 0xff, 0x0a]),
        () => Effect.void,
      );
      expect(result.refusal).toEqual(Option.none());
      expect(result.outcome).toBe("later-step-failed");
      expect(result.footprint).toEqual([
        { path: result.file, change: "modified" },
        { path: result.file, change: "restored" },
      ]);
      expect(yield* result.fs.readFileString(result.file)).toBe("before\n");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("refuses a publication whose route becomes unresolvable without digesting it", () =>
    Effect.gen(function* () {
      const result = yield* publishWithInterference("after\n", ({ fs, path, root }) =>
        Effect.gen(function* () {
          yield* fs.rename(path.join(root, "P"), path.join(root, "P.aside"));
          yield* fs.symlink(path.join(root, "missing"), path.join(root, "P"));
        }),
      );
      yield* expectRefusedAndRetained(result, "publication-route-unresolvable");
      expect(result.verificationHashes).toBe(0);
      expect(
        yield* result.fs.readFileString(result.path.join(result.root, "P.aside", "target.txt")),
      ).toBe("after\n");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("refuses a publication replaced by a directory", () =>
    Effect.gen(function* () {
      const result = yield* publishWithInterference("after\n", ({ fs, file }) =>
        Effect.gen(function* () {
          yield* fs.remove(file);
          yield* fs.makeDirectory(file);
        }),
      );
      yield* expectRefusedAndRetained(result, "publication-changed-before-recording");
      expect((yield* result.fs.stat(result.file)).type).toBe("Directory");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect.skipIf(privileged)("refuses a publication that becomes unreadable", () =>
    Effect.gen(function* () {
      const result = yield* publishWithInterference("after\n", ({ fs, file }) =>
        fs.chmod(file, 0o000),
      );
      yield* result.fs.chmod(result.file, 0o600);
      yield* expectRefusedAndRetained(result, "publication-changed-before-recording");
      expect(yield* result.fs.readFileString(result.file)).toBe("after\n");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});
