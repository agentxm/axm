import { withDetailedWork } from "../../locations/testing.js";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Tracer from "effect/Tracer";
import type { Plan } from "../../operations/index.js";
import { isExecutionCandidateFresh, makeExecutionCandidate } from "./execution-candidate.js";

it.effect(
  "attributes recursive candidate hashing and revalidation against fixed framed-byte vectors",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const settingsPath = path.join(root, "axm.json");
      const payload = path.join(root, "payload");
      const run = path.join(payload, "run");
      yield* fs.makeDirectory(payload);
      yield* fs.writeFileString(settingsPath, "{}");
      yield* fs.writeFileString(run, "α");
      yield* fs.chmod(settingsPath, 0o644);
      yield* fs.chmod(run, 0o644);
      const reads: Array<string> = [];
      let refusePayload = false;
      const observed: FileSystem.FileSystem = {
        ...fs,
        readFile: (target) =>
          Effect.gen(function* () {
            reads.push(target);
            if (target === run && refusePayload)
              return yield* PlatformError.systemError({
                _tag: "PermissionDenied",
                module: "FileSystem",
                method: "readFile",
              });
            return yield* fs.readFile(target);
          }),
      };
      const spans: Tracer.NativeSpan[] = [];
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      const plan: Plan = {
        _tag: "Plan",
        name: "Candidate witness",
        description: Option.none(),
        materialPaths: [payload],
        jobs: [{ concurrency: 1, steps: [] }],
      };
      const paths = { baseDir: root, settingsPath, lockPath: path.join(root, "axm.lock") };
      yield* Effect.gen(function* () {
        const candidate = yield* makeExecutionCandidate(plan, paths);
        // Fixed SHA-256 vectors for the complete literal frame stream, including its separators.
        expect(candidate.materialFingerprint).toBe(
          path.sep === "\\"
            ? "8460d5d774d17743a564729272b50623f30cc5a2dc9a44d3c45f839a7bce65f4"
            : "3384563921ea636bf9fabe61049203122d121c89f602ca4f2fa1ca651e1221e4",
        );
        expect(candidate.id).toBe(
          path.sep === "\\"
            ? "368c25c8ee84575854eb60de9cfb004a1990782e9b5ef6f8bfa7a1baadb022c6"
            : "30d7e3ca16555570864c7d0d05a1f3f77a65088a2904c2816106d638fb24a2ad",
        );
        const observed = yield* makeExecutionCandidate(plan, {
          ...paths,
          observedInputFingerprint: "π",
        });
        expect(observed.id).toBe(
          path.sep === "\\"
            ? "d9f872831ec572d4adb62e2c2d317a4e9e6b757181ca4764441789c5eecb48d0"
            : "c48f12f0211399c31e14b827e954a09a90adf74d65fb080f9da267eb9a46c243",
        );
        expect(yield* isExecutionCandidateFresh(candidate)).toBe(true);
        yield* fs.writeFileString(run, "β");
        expect(yield* isExecutionCandidateFresh(candidate)).toBe(false);
        refusePayload = true;
        const failed = yield* isExecutionCandidateFresh(candidate).pipe(Effect.result);
        expect(failed._tag).toBe("Failure");
      }).pipe(Effect.provideService(FileSystem.FileSystem, observed), withDetailedWork(tracer));
      expect(reads).toEqual([
        settingsPath,
        run,
        settingsPath,
        run,
        settingsPath,
        run,
        settingsPath,
        run,
        settingsPath,
        run,
      ]);
      const hashes = spans.filter((span) => span.name === "axm.hash.execution-materials");
      expect(hashes.map((span) => span.attributes.get("axm.work.bytes"))).toEqual([
        100, 100, 100, 100, 47,
      ]);
      expect(hashes.map((span) => span.attributes.get("axm.work.count"))).toEqual([
        12, 12, 12, 12, 6,
      ]);
      expect(hashes.map((span) => span.status._tag === "Ended" && span.status.exit._tag)).toEqual([
        "Success",
        "Success",
        "Success",
        "Success",
        "Failure",
      ]);
      expect(JSON.stringify(hashes.map((span) => [...span.attributes]))).not.toContain(root);
      const identities = spans.filter((span) => span.name === "axm.hash.execution-candidate");
      expect(identities.map((span) => span.attributes.get("axm.work.count"))).toEqual([1, 1]);
      expect(identities.map((span) => span.attributes.get("axm.work.bytes"))).toEqual([131, 149]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
