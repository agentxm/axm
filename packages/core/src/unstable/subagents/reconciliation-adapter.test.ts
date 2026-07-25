import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { Settings } from "../settings/index.js";
import { handle } from "../test-helpers.js";
import {
  buildReconciliationSnapshot,
  ReconciliationAdapters,
} from "../workspace/reconciliation.js";
import { subagentReconciliationAdapter } from "./reconciliation-adapter.js";

const reconciliationAdaptersLayer = Layer.succeed(ReconciliationAdapters, [
  subagentReconciliationAdapter,
]);
const testLayer = Layer.mergeAll(NodeServices.layer, reconciliationAdaptersLayer);

describe("subagent reconciliation adapter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-subagent-reconcile-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const snapshotFor = (settings: Settings) =>
    buildReconciliationSnapshot({
      baseDir: tempDir,
      now: new Date("2026-02-25T10:00:00.000Z"),
      configuredOwner: Option.some(handle("@community")),
      agents: ["claude-code"],
      settings,
    }).pipe(Effect.provide(testLayer));

  it.effect("requires canonical registry metadata instead of reconstructing it from disk", () =>
    Effect.gen(function* () {
      const snapshot = yield* snapshotFor({
        skills: {},
        subagents: {
          helper: { source: "@acme/subagents/helper@^1", enabled: true },
        },
      });

      expect(Object.keys(snapshot.lockfile.subagents ?? {})).toEqual([]);
      expect(snapshot.unresolved).toEqual([
        expect.objectContaining({ reason: "missing-registry-metadata" }),
      ]);
    }),
  );

  it.effect("reports declaration mismatch for a non-registry source", () =>
    Effect.gen(function* () {
      const snapshot = yield* snapshotFor({
        skills: {},
        subagents: {
          helper: { source: "file:///local/path", enabled: true },
        },
      });

      expect(snapshot.unresolved).toEqual([
        expect.objectContaining({ reason: "declaration-mismatch" }),
      ]);
    }),
  );

  it.effect("produces no lock entry when no subagent is declared", () =>
    Effect.gen(function* () {
      const snapshot = yield* snapshotFor({ skills: {}, subagents: {} });

      expect(snapshot.lockfile.subagents).toEqual({});
      expect(snapshot.unresolved).toEqual([]);
    }),
  );
});
