import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command } from "effect/unstable/cli";

import { Screen, rawDoc, successDoc } from "../../screen/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { makeUserArchiveCache } from "@agentxm/registry-client";
import { withRuntime } from "../../runtime.js";
import { observeUnit } from "@agentxm/workspace-operations";
import { withLiveOperation } from "../shared/operation-lifecycle.js";

const CacheStatusSchema = Schema.Struct({
  entries: Schema.Number,
  bytes: Schema.Number,
  maxBytes: Schema.Number,
  maxAgeDays: Schema.Number,
});

export const CacheStatusOutputSchema = CacheStatusSchema;
export type CacheStatusOutput = typeof CacheStatusOutputSchema.Type;

const CacheVerifySchema = Schema.Struct({
  checked: Schema.Number,
  valid: Schema.Number,
  corruptRemoved: Schema.Number,
});

export const CacheVerifyOutputSchema = Schema.Struct({ result: CacheVerifySchema });
export type CacheVerifyOutput = typeof CacheVerifyOutputSchema.Type;

const CachePruneSchema = Schema.Struct({
  removed: Schema.Number,
  bytesFreed: Schema.Number,
  remaining: Schema.Number,
  remainingBytes: Schema.Number,
});

export const CachePruneOutputSchema = Schema.Struct({ result: CachePruneSchema });
export type CachePruneOutput = typeof CachePruneOutputSchema.Type;

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"] as const;
  let value = bytes / 1024;
  let unit: (typeof units)[number] = units[0];
  for (const candidate of units.slice(1)) {
    if (value < 1024) break;
    value /= 1024;
    unit = candidate;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
};

export const handleCacheStatus = Effect.fn("Cache.status")(function* () {
  const screen = yield* Screen;
  const cache = yield* makeUserArchiveCache();
  const status = yield* withLiveOperation(
    { command: "cache.status", name: "Inspect archive cache", mode: "preview" },
    observeUnit({ id: "status", label: "archive cache status" }, cache.status()),
  );
  if (yield* screen.document(status, CacheStatusOutputSchema)) return;
  yield* screen.result(
    rawDoc(
      [
        "Archive cache",
        `Entries  ${status.entries}`,
        `Size     ${formatBytes(status.bytes)}`,
        `Limit    ${formatBytes(status.maxBytes)}`,
        `Max age  ${status.maxAgeDays} days`,
        "",
      ].join("\n"),
    ),
  );
});

export const handleCacheVerify = Effect.fn("Cache.verify")(function* () {
  const screen = yield* Screen;
  const cache = yield* makeUserArchiveCache();
  const result = yield* withLiveOperation(
    { command: "cache.verify", name: "Verify archive cache", mode: "apply" },
    observeUnit({ id: "verify", label: "cached archives" }, cache.verify()),
  );
  if (yield* screen.document({ result }, CacheVerifyOutputSchema)) return;
  yield* screen.result(
    successDoc(
      `Verified ${result.checked} archive cache entr${result.checked === 1 ? "y" : "ies"}; ${result.corruptRemoved} corrupt removed.`,
    ),
  );
});

export const handleCachePrune = Effect.fn("Cache.prune")(function* () {
  const screen = yield* Screen;
  const cache = yield* makeUserArchiveCache();
  const result = yield* withLiveOperation(
    { command: "cache.prune", name: "Prune archive cache", mode: "apply" },
    observeUnit({ id: "prune", label: "expired and excess archives" }, cache.prune()),
  );
  if (yield* screen.document({ result }, CachePruneOutputSchema)) return;
  yield* screen.result(
    successDoc(
      `Pruned ${result.removed} archive cache entr${result.removed === 1 ? "y" : "ies"} (${formatBytes(result.bytesFreed)}); ${result.remaining} remain (${formatBytes(result.remainingBytes)}).`,
    ),
  );
});

const statusConfig = {} as const;
const verifyConfig = {} as const;
const pruneConfig = {} as const;

export const cacheStatusCommand = Command.make("status", statusConfig, () =>
  handleCacheStatus().pipe(withRuntime("cache status")),
).pipe(
  withArgvTracking(statusConfig),
  Command.withDescription("Show verified registry archive cache usage and limits"),
  Command.withExamples([
    { command: "axm cache status", description: "Show archive cache usage" },
    { command: "axm cache status --json", description: "Emit cache status as JSON" },
  ]),
);

export const cacheVerifyCommand = Command.make("verify", verifyConfig, () =>
  handleCacheVerify().pipe(withRuntime("cache verify")),
).pipe(
  withArgvTracking(verifyConfig),
  Command.withDescription("Verify every cached archive and remove corrupt entries"),
  Command.withExamples([
    { command: "axm cache verify", description: "Verify cached archive integrity" },
    { command: "axm cache verify --json", description: "Emit verification results as JSON" },
  ]),
);

export const cachePruneCommand = Command.make("prune", pruneConfig, () =>
  handleCachePrune().pipe(withRuntime("cache prune")),
).pipe(
  withArgvTracking(pruneConfig),
  Command.withDescription("Remove expired archives and enforce the 2 GiB cache limit"),
  Command.withExamples([
    { command: "axm cache prune", description: "Prune expired and excess cache entries" },
    { command: "axm cache prune --json", description: "Emit pruning results as JSON" },
  ]),
);

export const cacheCommand = Command.make("cache").pipe(
  Command.withDescription("Inspect and maintain the verified registry archive cache"),
  Command.withExamples([
    { command: "axm cache status", description: "Show archive cache usage" },
    { command: "axm cache verify", description: "Verify cached archive integrity" },
    { command: "axm cache prune", description: "Remove expired and excess entries" },
  ]),
  Command.withSubcommands([cacheStatusCommand, cacheVerifyCommand, cachePruneCommand]),
);
