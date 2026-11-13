import { workObservations } from "../locations/testing.js";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Tracer from "effect/Tracer";
import { makeObservedLockFileSystem } from "./native-lock-filesystem.js";

it.effect.each([false, true])(
  "preserves bounded native callback failure facts (detail=%s)",
  (detail) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const missing = path.join(root, "private-missing-lock-name");
      const observations = workObservations(detail);
      const spans: Tracer.NativeSpan[] = [];
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      const actual = yield* Effect.gen(function* () {
        const native = yield* makeObservedLockFileSystem;
        return yield* native.during(
          "acquire",
          Effect.promise(
            () =>
              new Promise<NodeJS.ErrnoException | null>((resolve) =>
                native.fs.stat(missing, (error) => resolve(error)),
              ),
          ),
        );
      }).pipe(Effect.withTracer(tracer), observations.provide);
      expect(actual?.code).toBe("ENOENT");
      expect(actual?.path).toBe(missing);
      const calls = observations.facts.filter((fact) => fact.kind === "axm.native.lock-io");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.outcome).toBe("failure");
      expect(calls[0]?.attributes).toEqual({
        "axm.native.operation": "stat",
        "axm.native.phase": "acquire",
        "axm.work.executed": 1,
        "axm.failure.kind": "not-found",
        "axm.outcome": "failure",
      });
      const details = spans.filter((span) => span.name === "axm.native.lock-io");
      expect(details).toHaveLength(detail ? 1 : 0);
      const acquisitions = observations.facts.filter(
        (fact) => fact.kind === "axm.native.lock-acquire",
      );
      expect(acquisitions).toHaveLength(1);
      expect(acquisitions[0]?.outcome).toBe("success");
      expect(acquisitions[0]?.attributes["axm.work.executed"]).toBe(1);
      expect(spans.filter((span) => span.name === "axm.native.lock-acquire")).toHaveLength(
        detail ? 1 : 0,
      );
      expect(JSON.stringify(calls)).not.toContain("private-missing-lock-name");
    }).pipe(Effect.provide(NodeServices.layer)),
);
