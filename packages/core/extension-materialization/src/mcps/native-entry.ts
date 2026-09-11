/**
 * Retiring a native MCP entry that a managed package now represents.
 *
 * Converting a native connection into an authored package leaves the original
 * declaration in the agent's own config file. Removing it is the last step of
 * that conversion and belongs inside the same transaction that publishes the
 * package, so it lives in this capability beside `installMcpServer` rather
 * than in the feature that discovered the native entry: the authoring routes
 * that perform the conversion may not import a peer feature.
 *
 * The removal is conditional on the config still saying what it said when the
 * conversion was planned. A native file that changed underneath is reported,
 * never overwritten.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

/** One native MCP declaration, addressed exactly as its config file holds it. */
export interface NativeMcpEntryRef {
  /** Absolute path of the agent-native config file holding the declaration. */
  readonly filePath: string;
  /** Key under which that file collects its MCP servers. */
  readonly serversKey: string;
  /** The native connection key being retired. */
  readonly name: string;
}

/**
 * A native declaration could not be retired. `category` and `detail` are the
 * producer's own decision so the surrounding closure reports the fact rather
 * than a generic sentence.
 */
export class NativeMcpEntryRetirementFailed extends Schema.TaggedError<NativeMcpEntryRetirementFailed>()(
  "NativeMcpEntryRetirementFailed",
  {
    category: Schema.Literals(["conflict", "internal", "validation"]),
    detail: Schema.String,
    filePath: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Remove one native entry that a managed package replaced.
 *
 * A declaration that is already gone is a settled outcome: the conversion is
 * idempotent, so re-running it after a partial retirement completes rather
 * than refusing.
 */
export const retireNativeMcpEntry = (
  entry: NativeMcpEntryRef,
): Effect.Effect<void, NativeMcpEntryRetirementFailed, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(entry.filePath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) {
      return yield* new NativeMcpEntryRetirementFailed({
        category: "conflict",
        detail: `MCP config disappeared before package conversion: ${entry.filePath}`,
        filePath: entry.filePath,
      });
    }
    const raw = yield* fs.readFileString(entry.filePath).pipe(
      Effect.mapError(
        (cause) =>
          new NativeMcpEntryRetirementFailed({
            category: "internal",
            detail: `Failed to read MCP config: ${entry.filePath}`,
            filePath: entry.filePath,
            cause,
          }),
      ),
    );
    const parsed = yield* Effect.try({
      try: (): unknown => JSON.parse(raw),
      catch: (cause) =>
        new NativeMcpEntryRetirementFailed({
          category: "validation",
          detail: `Invalid JSON in MCP config: ${entry.filePath}`,
          filePath: entry.filePath,
          cause,
        }),
    });
    if (!isRecord(parsed)) {
      return yield* new NativeMcpEntryRetirementFailed({
        category: "conflict",
        detail: `MCP config disappeared before package conversion: ${entry.filePath}`,
        filePath: entry.filePath,
      });
    }
    const servers = parsed[entry.serversKey];
    if (!isRecord(servers)) {
      return yield* new NativeMcpEntryRetirementFailed({
        category: "conflict",
        detail: `MCP server collection changed before package conversion: ${entry.filePath}`,
        filePath: entry.filePath,
      });
    }
    const declaration = servers[entry.name];
    if (declaration === undefined) return;
    if (!isRecord(declaration)) {
      return yield* new NativeMcpEntryRetirementFailed({
        category: "conflict",
        detail: `MCP server ${entry.name} changed before package conversion`,
        filePath: entry.filePath,
      });
    }
    const remaining = Object.fromEntries(
      Object.entries(servers).filter(([name]) => name !== entry.name),
    );
    yield* fs
      .writeFileString(
        entry.filePath,
        `${JSON.stringify({ ...parsed, [entry.serversKey]: remaining }, null, 2)}\n`,
      )
      .pipe(
        Effect.mapError(
          (cause) =>
            new NativeMcpEntryRetirementFailed({
              category: "internal",
              detail: `Failed to replace native MCP config: ${entry.filePath}`,
              filePath: entry.filePath,
              cause,
            }),
        ),
      );
  });
