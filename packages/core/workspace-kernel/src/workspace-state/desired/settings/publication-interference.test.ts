/**
 * Supporting regression for the accepted physical-restoration rule:
 * workspace/locations/settlement-protects-physical-boundaries-once.
 * Requirement acceptance stays in the existing specification; this test adds
 * a real settings-owner interference case at its legitimate owning slice.
 */
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Tracer from "effect/Tracer";
import { NativePlatformTest } from "../../../locations/testing.js";
import { recordFootprint, runWorkspaceTransaction } from "../../../settlement/index.js";
import { WorkspaceTransactionScopeTest } from "../../../settlement/testing.js";
import { SettingsSchema } from "./schema.js";
import { writeSettingsAtPath } from "./settings.js";

// Foreign publication between replace and record is scheduled at the real filesystem seam.
// The forwarding service executes every operation on the real filesystem. It
// deterministically schedules a real foreign edit after the owner's rename.
it.effect.each(["content", "entry"] as const)(
  "preserves a foreign settings %s change between atomic replacement and postimage recording",
  (change) =>
    Effect.gen(function* () {
      const real = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* real.makeTempDirectoryScoped().pipe(Effect.flatMap(real.realPath));
      const settingsPath = path.join(root, "axm.json");
      const independent = path.join(root, "independent.txt");
      const before = '{"agents":["claude-code"],"futureCapability":{"enabled":true}}\n';
      let foreign = '{"agents":["claude-code","cursor"],"futureCapability":{"enabled":false}}\n';
      yield* real.writeFileString(settingsPath, before);
      yield* real.writeFileString(independent, "original independent content");
      const next = yield* Schema.decodeUnknownEffect(SettingsSchema)({
        agents: ["claude-code", "cursor"],
        futureCapability: { enabled: true },
      });
      let injected = false;
      const spans: Tracer.NativeSpan[] = [];
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      let ownedInode: string | undefined;
      let foreignInode: string | undefined;
      const injectionFailures: string[] = [];
      const forwarding: FileSystem.FileSystem = {
        ...real,
        rename: (source, target) =>
          real.rename(source, target).pipe(
            Effect.tap(() => {
              if (target !== settingsPath || injected) return Effect.void;
              injected = true;
              return Effect.gen(function* () {
                if (change === "entry") {
                  foreign = yield* real.readFileString(settingsPath);
                  ownedInode = Option.getOrThrow((yield* real.stat(settingsPath)).ino).toString();
                  const other = path.join(root, "foreign-replacement");
                  yield* real.writeFileString(other, foreign);
                  // Windows refuses replacement over an open destination. Move
                  // that object aside, then publish the distinct foreign entry.
                  yield* real.rename(settingsPath, path.join(root, "displaced-owner"));
                  yield* real.rename(other, settingsPath);
                } else yield* real.writeFileString(settingsPath, foreign);
                foreignInode = Option.getOrThrow((yield* real.stat(settingsPath)).ino).toString();
              }).pipe(
                Effect.tapError((error) =>
                  Effect.sync(() => {
                    injectionFailures.push(String(error));
                  }),
                ),
              );
            }),
          ),
      };
      const result = yield* runWorkspaceTransaction({
        claimDefaultTargets: false,
        targets: [settingsPath, independent],
        transition: Effect.gen(function* () {
          yield* real.writeFileString(independent, "AXM independent postimage");
          yield* recordFootprint({ path: independent, change: "modified" });
          yield* writeSettingsAtPath(settingsPath, next);
          return yield* Effect.fail("later-step-failed");
        }),
        validate: () => Effect.void,
      }).pipe(
        Effect.provide(
          WorkspaceTransactionScopeTest({
            workspaceDir: path.join(root, ".axm"),
            settingsPath,
            lockPath: path.join(root, "axm.lock"),
          }),
        ),
        Effect.provideService(FileSystem.FileSystem, forwarding),
        Effect.withTracer(tracer),
        Effect.result,
      );
      const cleanup =
        result._tag === "Failure" &&
        typeof result.failure !== "string" &&
        result.failure._tag === "WorkspaceRestorationIncomplete" &&
        result.failure.snapshotDir !== undefined
          ? real.remove(result.failure.snapshotDir, { recursive: true, force: true })
          : Effect.void;
      yield* Effect.gen(function* () {
        expect(injectionFailures).toEqual([]);
        expect(injected).toBe(true);
        expect(foreignInode).toBeDefined();
        expect(yield* real.readFileString(settingsPath)).toBe(foreign);
        expect(Option.getOrThrow((yield* real.stat(settingsPath)).ino).toString()).toBe(
          foreignInode,
        );
        if (change === "entry") {
          expect(ownedInode).toBeDefined();
          expect(foreignInode).not.toBe(ownedInode);
        }
        expect(yield* real.readFileString(independent)).toBe("original independent content");
        const publications = spans.filter((span) => span.name === "axm.verify.publication");
        expect(
          publications.map((span) => span.status._tag === "Ended" && span.status.exit._tag),
        ).toEqual(["Failure"]);
        const restores = spans.filter((span) => span.name === "axm.rollback.restore");
        expect(
          restores.map((span) => span.status._tag === "Ended" && span.status.exit._tag).sort(),
        ).toEqual(["Failure", "Success"]);
        if (
          result._tag !== "Failure" ||
          typeof result.failure === "string" ||
          result.failure._tag !== "WorkspaceRestorationIncomplete"
        )
          return expect.fail("Expected foreign settings retained with original recovery evidence");
        const recovery = result.failure.recovery.find(
          (entry) => entry.originalPath === settingsPath,
        );
        expect(recovery?.kind).toBe("snapshot");
        if (recovery !== undefined)
          expect(yield* real.readFileString(recovery.recoveryPath)).toBe(before);
      }).pipe(Effect.ensuring(cleanup.pipe(Effect.orDie)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);
