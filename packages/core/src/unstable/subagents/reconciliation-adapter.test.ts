import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { Settings } from "../settings/index.js";
import { handle } from "../test-helpers.js";
import { subagentReconciliationAdapter } from "./reconciliation-adapter.js";
import {
  buildReconciliationSnapshot,
  ReconciliationAdapters,
} from "../workspace/reconciliation.js";

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

  const withContext = <A, E>(
    effect: Effect.Effect<A, E, NodeServices.NodeServices | ReconciliationAdapters>,
  ) => effect.pipe(Effect.provide(testLayer));

  const makeContext = (settings: Settings) => ({
    baseDir: tempDir,
    now: new Date("2026-02-25T10:00:00.000Z"),
    defaultProfile: handle("@community"),
    agents: ["claude-code"],
    settings,
  });

  const writeSubagentManifest = (owner: string, name: string, version: string) => {
    const canonical = path.join(tempDir, ".axm", "extensions", owner, "subagents", name);
    fs.mkdirSync(canonical, { recursive: true });
    fs.writeFileSync(
      path.join(canonical, "subagent.json"),
      JSON.stringify({
        owner,
        type: "subagent",
        name,
        version,
      }),
    );
    return canonical;
  };

  it.effect(
    "reconstructs compatible subagent declaration from disk (source unchanged — skip render)",
    () =>
      withContext(
        Effect.gen(function* () {
          writeSubagentManifest("@acme", "helper", "1.0.0");

          const settings: Settings = {
            skills: {},
            subagents: {
              helper: { source: "@acme/subagents/helper@^1", enabled: true, authored: false },
            },
          };

          const snapshot = yield* buildReconciliationSnapshot(makeContext(settings));

          expect(Object.keys(snapshot.lockfile.subagents ?? {})).toEqual(["helper"]);
          expect(snapshot.unresolved).toEqual([]);
        }),
      ),
  );

  it.effect("reports unresolved when source changed (manifest missing on disk)", () =>
    withContext(
      Effect.gen(function* () {
        // No manifest on disk — simulates needing re-render
        const settings: Settings = {
          skills: {},
          subagents: {
            helper: { source: "@acme/subagents/helper@^1", enabled: true, authored: false },
          },
        };

        const snapshot = yield* buildReconciliationSnapshot(makeContext(settings));

        expect(Object.keys(snapshot.lockfile.subagents ?? {})).toEqual([]);
        expect(snapshot.unresolved).toHaveLength(1);
        expect(snapshot.unresolved[0]?.reason).toBe("missing");
      }),
    ),
  );

  it.effect("reports unresolved when manifest is invalid JSON", () =>
    withContext(
      Effect.gen(function* () {
        const canonical = path.join(tempDir, ".axm", "extensions", "@acme", "subagents", "helper");
        fs.mkdirSync(canonical, { recursive: true });
        fs.writeFileSync(path.join(canonical, "subagent.json"), "not-json{{{");

        const settings: Settings = {
          skills: {},
          subagents: {
            helper: { source: "@acme/subagents/helper@^1", enabled: true, authored: false },
          },
        };

        const snapshot = yield* buildReconciliationSnapshot(makeContext(settings));

        expect(Object.keys(snapshot.lockfile.subagents ?? {})).toEqual([]);
        expect(snapshot.unresolved).toHaveLength(1);
        expect(snapshot.unresolved[0]?.reason).toBe("invalid");
      }),
    ),
  );

  it.effect("reports declaration-mismatch when manifest owner differs from declaration", () =>
    withContext(
      Effect.gen(function* () {
        writeSubagentManifest("@other", "helper", "1.0.0");

        // Write manifest at @acme path but with @other owner in content
        const canonical = path.join(tempDir, ".axm", "extensions", "@acme", "subagents", "helper");
        fs.mkdirSync(canonical, { recursive: true });
        fs.writeFileSync(
          path.join(canonical, "subagent.json"),
          JSON.stringify({
            owner: "@other",
            type: "subagent",
            name: "helper",
            version: "1.0.0",
          }),
        );

        const settings: Settings = {
          skills: {},
          subagents: {
            helper: { source: "@acme/subagents/helper@^1", enabled: true, authored: false },
          },
        };

        const snapshot = yield* buildReconciliationSnapshot(makeContext(settings));

        expect(Object.keys(snapshot.lockfile.subagents ?? {})).toEqual([]);
        expect(snapshot.unresolved).toHaveLength(1);
        expect(snapshot.unresolved[0]?.reason).toBe("declaration-mismatch");
      }),
    ),
  );

  it.effect("reports declaration-mismatch for non-registry, non-'registry' source", () =>
    withContext(
      Effect.gen(function* () {
        const settings: Settings = {
          skills: {},
          subagents: {
            helper: { source: "file:///local/path", enabled: true, authored: false },
          },
        };

        const snapshot = yield* buildReconciliationSnapshot(makeContext(settings));

        expect(Object.keys(snapshot.lockfile.subagents ?? {})).toEqual([]);
        expect(snapshot.unresolved).toHaveLength(1);
        expect(snapshot.unresolved[0]?.reason).toBe("declaration-mismatch");
      }),
    ),
  );

  it.effect("handles disabled subagent in settings (still scans declaration)", () =>
    withContext(
      Effect.gen(function* () {
        writeSubagentManifest("@acme", "helper", "1.0.0");

        const settings: Settings = {
          skills: {},
          subagents: {
            helper: { source: "@acme/subagents/helper@^1", enabled: false, authored: false },
          },
        };

        const snapshot = yield* buildReconciliationSnapshot(makeContext(settings));

        // Adapter still scans and checks disk compatibility for disabled subagents
        expect(Object.keys(snapshot.lockfile.subagents ?? {})).toEqual(["helper"]);
        expect(snapshot.unresolved).toEqual([]);
      }),
    ),
  );

  it.effect("orphan cleanup: subagent absent from settings produces empty lockfile", () =>
    withContext(
      Effect.gen(function* () {
        // Manifest exists on disk but not in settings
        writeSubagentManifest("@acme", "helper", "1.0.0");

        const settings: Settings = {
          skills: {},
          subagents: {},
        };

        const snapshot = yield* buildReconciliationSnapshot(makeContext(settings));

        // No declarations scanned means no lockfile entries
        expect(Object.keys(snapshot.lockfile.subagents ?? {})).toEqual([]);
        expect(snapshot.unresolved).toEqual([]);
      }),
    ),
  );

  it.effect("reconstructs with fallback to defaultProfile for bare 'registry' source", () =>
    withContext(
      Effect.gen(function* () {
        writeSubagentManifest("@community", "helper", "2.0.0");

        const settings: Settings = {
          skills: {},
          subagents: {
            helper: { source: "registry", enabled: true, authored: false },
          },
        };

        const snapshot = yield* buildReconciliationSnapshot(makeContext(settings));

        expect(Object.keys(snapshot.lockfile.subagents ?? {})).toEqual(["helper"]);
        const entry = snapshot.lockfile.subagents?.["helper"];
        expect(entry?.type).toBe("registry");
        if (entry?.type === "registry") {
          expect(entry.owner).toBe("@community");
        }
      }),
    ),
  );
});
