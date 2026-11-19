import { bytes, count, recordDoc, type Doc } from "../../screen/index.js";

const entries = (value: number): string =>
  count(value, "archive cache entry", "archive cache entries");

/** What the archive cache holds and the limits it keeps to. */
export const cacheStatusDoc = (status: {
  readonly entries: number;
  readonly bytes: number;
  readonly maxBytes: number;
  readonly maxAgeDays: number;
}): Doc =>
  recordDoc({
    tone: "neutral",
    verdict: "Archive cache",
    facts: [entries(status.entries)],
    fields: [
      { label: "Size", value: bytes(status.bytes) },
      { label: "Limit", value: bytes(status.maxBytes) },
      { label: "Max age", value: count(status.maxAgeDays, "day") },
    ],
  });

/** How many cached archives verified, and how many corrupt ones it removed. */
export const cacheVerifyDoc = (result: {
  readonly checked: number;
  readonly corruptRemoved: number;
}): Doc =>
  recordDoc({
    tone: "ok",
    verdict: `Verified ${entries(result.checked)}`,
    facts: [`${String(result.corruptRemoved)} corrupt removed`],
  });

/** What pruning removed and what it kept. */
export const cachePruneDoc = (result: {
  readonly removed: number;
  readonly bytesFreed: number;
  readonly remaining: number;
  readonly remainingBytes: number;
}): Doc =>
  recordDoc({
    tone: "ok",
    verdict: `Pruned ${entries(result.removed)}`,
    facts: [
      `${bytes(result.bytesFreed)} freed`,
      `${String(result.remaining)} remain`,
      `${bytes(result.remainingBytes)} kept`,
    ],
  });
