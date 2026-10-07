import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  DIAGNOSTIC_LIMITS,
  makeTerminalDiagnostics,
  writeLocalFailureRecord,
} from "./terminal-diagnostics.js";
import { exportLocalDiagnostic, reviewLocalDiagnostic } from "./diagnostic-record.js";

const id = "00000000-0000-4000-8000-000000000001";
const failure = {
  kind: "registry.response-decode",
  operation: "publish.upload",
  phase: "command",
  category: "internal",
  errorClass: "internal",
  handled: true,
} as const;

describe("reviewed local diagnostic export", () => {
  it.effect("exports exactly the reviewed content without replacing existing files", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const diagnostics = yield* makeTerminalDiagnostics({ eventIdFactory: () => id });
        const settlementFailure = { ...failure, code: "internal" };
        const record = yield* diagnostics.prepare(settlementFailure, new Error("local detail"));
        yield* writeLocalFailureRecord(record, directory);
        const review = yield* reviewLocalDiagnostic(id, directory);
        const output = path.join(directory, "reviewed.json");
        const exported = yield* exportLocalDiagnostic({
          id,
          reviewSha256: review.sha256,
          output,
          directory,
        });
        expect(exported.sha256).toBe(review.sha256);
        expect(yield* fs.readFileString(output)).toBe(review.content);
        if (process.platform !== "win32") expect((yield* fs.stat(output)).mode & 0o777).toBe(0o600);
        const overwrite = yield* exportLocalDiagnostic({
          id,
          reviewSha256: review.sha256,
          output,
          directory,
        }).pipe(Effect.flip);
        expect(overwrite._tag).toBe("AppError");
        expect(yield* fs.readFileString(output)).toBe(review.content);
        expect((yield* fs.readDirectory(directory)).some((name) => name.endsWith(".tmp"))).toBe(
          false,
        );
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects unreviewed or changed content before writing an export", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const diagnostics = yield* makeTerminalDiagnostics({ eventIdFactory: () => id });
        yield* writeLocalFailureRecord(
          yield* diagnostics.prepare(failure, new Error("first")),
          directory,
        );
        const review = yield* reviewLocalDiagnostic(id, directory);
        yield* writeLocalFailureRecord(
          yield* diagnostics.prepare(failure, new Error("changed")),
          directory,
        );
        const output = path.join(directory, "export.json");
        const error = yield* exportLocalDiagnostic({
          id,
          reviewSha256: review.sha256,
          output,
          directory,
        }).pipe(Effect.flip);
        expect(error._tag).toBe("AppError");
        expect(yield* fs.exists(output)).toBe(false);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("bounds reads and refuses traversal, invalid records and mismatched identity", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        expect((yield* reviewLocalDiagnostic("../other", directory).pipe(Effect.flip))._tag).toBe(
          "AppError",
        );
        const filename = path.join(directory, `${id}.json`);
        yield* fs.writeFileString(filename, "x".repeat(DIAGNOSTIC_LIMITS.bytes + 1));
        const oversized = yield* reviewLocalDiagnostic(id, directory).pipe(Effect.flip);
        expect(oversized._tag === "AppError" && oversized.code).toBe("validation");
        yield* fs.writeFileString(filename, "{}");
        expect((yield* reviewLocalDiagnostic(id, directory).pipe(Effect.flip))._tag).toBe(
          "AppError",
        );
        const diagnostics = yield* makeTerminalDiagnostics({ eventIdFactory: () => id });
        const record = yield* diagnostics.prepare(failure);
        yield* fs.writeFileString(
          filename,
          JSON.stringify({ ...record, eventId: "00000000-0000-4000-8000-000000000002" }),
        );
        const mismatched = yield* reviewLocalDiagnostic(id, directory).pipe(Effect.flip);
        expect(mismatched._tag === "AppError" && mismatched.detail).toBe(
          "The diagnostic record does not match the requested ID.",
        );
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );
});
