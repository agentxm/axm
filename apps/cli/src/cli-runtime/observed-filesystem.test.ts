import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import { observedFileSystem, withLocalTracing } from "./index.js";
import { localTracingCollector } from "../test-support/local-tracing-collector.js";

describe("Physical filesystem diagnostic accounting", () => {
  it.live(
    "distinguishes an expected existence probe from a missing required read and permission denial",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const receiver = yield* localTracingCollector();
          const calls: string[] = [];
          const missing = PlatformError.systemError({
            _tag: "NotFound",
            module: "FileSystem",
            method: "readFile",
            pathOrDescriptor: "PRIVATE",
          });
          const denied = PlatformError.systemError({
            _tag: "PermissionDenied",
            module: "FileSystem",
            method: "access",
            pathOrDescriptor: "PRIVATE",
          });
          const fs = observedFileSystem(
            FileSystem.makeNoop({
              access: (target) =>
                Effect.suspend(() => {
                  calls.push("access");
                  return Effect.fail(target === "missing" ? missing : denied);
                }),
              readFile: () =>
                Effect.suspend(() => {
                  calls.push("read");
                  return Effect.fail(missing);
                }),
            }),
          );
          yield* withLocalTracing(
            Effect.gen(function* () {
              expect(yield* fs.exists("missing")).toBe(false);
              expect(yield* Effect.flip(fs.readFile("missing"))).toBe(missing);
              expect(yield* Effect.flip(fs.exists("denied"))).toBe(denied);
            }),
            { AXM_TRACE: "1", AXM_TRACE_DETAIL: "io", AXM_TRACE_ENDPOINT: receiver.endpoint },
          );
          expect(calls).toEqual(["access", "read", "access"]);
          const classified = receiver
            .spans()
            .filter((span) => span.name === "axm.io.access" || span.name === "axm.io.read-file")
            .map((span) => ({
              name: span.name,
              kind: span.attributes.find((attribute) => attribute.key === "axm.failure.kind")
                ?.value["stringValue"],
            }));
          expect(classified).toEqual([
            { name: "axm.io.access", kind: "expected-absence" },
            { name: "axm.io.read-file", kind: "not-found" },
            { name: "axm.io.access", kind: "denied" },
          ]);
          expect(receiver.bodies.join("")).not.toContain("PRIVATE");
        }),
      ),
  );
  for (const mode of ["summary", "detail"]) {
    it.live(`reconciles ${mode} accounting with executed filesystem calls`, () =>
      Effect.scoped(
        Effect.gen(function* () {
          const receiver = yield* localTracingCollector();
          let actualReads = 0;
          let actualWrites = 0;
          const fs = observedFileSystem(
            FileSystem.makeNoop({
              readFile: () =>
                Effect.sync(() => {
                  actualReads += 1;
                  return new TextEncoder().encode("abc");
                }),
              writeFile: () =>
                Effect.sync(() => {
                  actualWrites += 1;
                }),
            }),
          );
          yield* withLocalTracing(
            Effect.gen(function* () {
              // Both derived and primitive calls reach exactly one physical owner.
              expect(yield* fs.readFileString("private/path")).toBe("abc");
              expect(yield* fs.readFile("private/path")).toEqual(new TextEncoder().encode("abc"));
              yield* fs.writeFileString("private/path", "abc");
            }),
            {
              AXM_TRACE: "1",
              AXM_TRACE_DETAIL: mode === "detail" ? "io" : "",
              AXM_TRACE_ENDPOINT: receiver.endpoint,
            },
          );
          expect(actualReads).toBe(2);
          expect(actualWrites).toBe(1);
          const spans = receiver.spans();
          const summary = receiver
            .logs()
            .find(
              (span) =>
                span.name === "axm.work.summary" &&
                span.attributes.some(
                  (attr) =>
                    attr.key === "axm.summary.kind" &&
                    attr.value["stringValue"] === "axm.io.read-file",
                ),
            );
          expect(summary?.attributes).toContainEqual({
            key: "axm.work.executed",
            value: { intValue: actualReads },
          });
          expect(summary?.attributes).toContainEqual({
            key: "axm.io.bytes",
            value: { intValue: 6 },
          });
          expect(spans.filter((span) => span.name === "axm.io.read-file")).toHaveLength(
            mode === "detail" ? actualReads : 0,
          );
          expect(receiver.bodies.join("")).not.toContain("private/path");
        }),
      ),
    );
  }
});
