import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { Settings } from "../settings/index.js";
import { handle } from "../test-helpers.js";
import {
  buildReconciliationSnapshot,
  ReconciliationAdapters,
} from "../workspace/reconciliation.js";
import { filesReconciliationAdapter } from "./reconciliation-adapter.js";

const reconciliationAdaptersLayer = Layer.succeed(ReconciliationAdapters, [
  filesReconciliationAdapter,
]);
const testLayer = Layer.mergeAll(NodeServices.layer, reconciliationAdaptersLayer);

describe("files reconciliation adapter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-files-reconcile-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const snapshotFor = (settings: Settings) =>
    buildReconciliationSnapshot({
      baseDir: tempDir,
      now: DateTime.makeUnsafe("2026-02-25T10:00:00.000Z"),
      configuredOwner: Option.some(handle("@community")),
      agents: ["claude-code"],
      settings,
    }).pipe(Effect.provide(testLayer));

  it.effect("requires canonical registry metadata instead of reconstructing it from disk", () =>
    Effect.gen(function* () {
      const snapshot = yield* snapshotFor({
        skills: {},
        files: {
          baseline: { source: "@acme/files/workspace-baseline@^1", enabled: true, inputs: {} },
        },
      });

      expect(Object.keys(snapshot.lockfile.files ?? {})).toEqual([]);
      expect(snapshot.unresolved).toEqual([
        expect.objectContaining({ reason: "missing-registry-metadata" }),
      ]);
    }),
  );

  it.effect("reports declaration mismatch for a non-registry source", () =>
    Effect.gen(function* () {
      const snapshot = yield* snapshotFor({
        skills: {},
        files: {
          baseline: { source: "file:///local/path", enabled: true, inputs: {} },
        },
      });

      expect(snapshot.unresolved).toEqual([
        expect.objectContaining({ reason: "declaration-mismatch" }),
      ]);
    }),
  );

  it.effect("produces no lock entry when no files package is declared", () =>
    Effect.gen(function* () {
      const snapshot = yield* snapshotFor({ skills: {}, files: {} });

      expect(snapshot.lockfile.files ?? {}).toEqual({});
      expect(snapshot.unresolved).toEqual([]);
    }),
  );
});
