/** Historical hook execution evidence is local state, separate from accepted package resolution. */
import { createHash } from "node:crypto";
import { arch, platform } from "node:os";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { HookEvidenceStatusSchema, HookTestResultSchema } from "../../../operations/index.js";

export const hookConfigurationHash = (values: Readonly<Record<string, unknown>>): string =>
  createHash("sha256")
    .update(
      JSON.stringify(Object.entries(values).sort(([left], [right]) => left.localeCompare(right))),
    )
    .digest("hex");

export const hookReceiptFilename = (root: string): string =>
  `${createHash("sha256").update(root).digest("hex")}.json`;

export const readHookEvidence = Effect.fn("Hook.readEvidence")(function* (args: {
  readonly runtimeDir: string;
  readonly packageRoot: string;
  readonly contentHash: string;
  readonly configurationHash: string;
  readonly scope: "project" | "user";
}): Effect.fn.Return<
  typeof HookEvidenceStatusSchema.Type,
  import("effect/PlatformError").PlatformError,
  FileSystem.FileSystem | Path.Path
> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(args.runtimeDir, "hook-tests", hookReceiptFilename(args.packageRoot));
  if (!(yield* fs.exists(file)))
    return {
      state: "absent",
      reason: "No fixture execution has been recorded for this package location",
    };
  const raw = yield* fs.readFileString(file);
  const decoded = Schema.decodeUnknownResult(Schema.fromJsonString(HookTestResultSchema))(raw);
  if (Result.isFailure(decoded))
    return { state: "invalid", reason: "The local fixture receipt is invalid" };
  const receipt = decoded.success;
  if (
    receipt.contentHash !== args.contentHash ||
    receipt.configurationHash !== args.configurationHash ||
    receipt.scope !== args.scope ||
    receipt.platform.os !== platform() ||
    receipt.platform.architecture !== arch()
  ) {
    return {
      state: "stale",
      receipt,
      reason:
        "Package content, effective configuration, scope, or execution platform changed after fixture execution",
    };
  }
  return {
    state: "historical",
    receipt,
    reason:
      "Content and configuration match; runtime environment and native host invocation have not been reverified",
  };
});
