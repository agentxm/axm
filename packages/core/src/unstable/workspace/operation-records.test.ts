import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  readOpenRecoveryRecords,
  resolveRecoveryRecords,
  writeOperationRecoveryRecord,
} from "./operation-records.js";

let tempDir: string;
let workspaceDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-operation-records-"));
  workspaceDir = path.join(tempDir, ".axm");
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const services = NodeServices.layer;

describe("operation recovery records", () => {
  it.effect("C-07: a retained-effects record is durable and detectable by a later invocation", () =>
    Effect.gen(function* () {
      const file = yield* writeOperationRecoveryRecord({
        workspaceDir,
        kind: "interruption",
        command: "update",
        signal: "SIGINT",
        retained: [".axm/extensions/@test/skills/one"],
        resolveBy: "Re-run axm update to continue the remaining units.",
      });
      expect(file).toBeDefined();
      const open = yield* readOpenRecoveryRecords(workspaceDir);
      expect(open.length).toBe(1);
      expect(open[0]?.record.kind).toBe("interruption");
      expect(open[0]?.record.retained).toEqual([".axm/extensions/@test/skills/one"]);
      expect(open[0]?.record.resolveBy).toContain("Re-run");
    }).pipe(Effect.provide(services)),
  );

  it.effect(
    "C-07: the condition stays detectable until resolved, and resolution appends a marker",
    () =>
      Effect.gen(function* () {
        yield* writeOperationRecoveryRecord({
          workspaceDir,
          kind: "restoration-failure",
          command: "workspace-transaction",
          retained: ["/tmp/axm-workspace-rollback-x"],
          resolveBy: "Restore the affected paths from the retained rollback backup.",
        });
        const before = yield* readOpenRecoveryRecords(workspaceDir);
        expect(before.length).toBe(1);
        yield* resolveRecoveryRecords({ workspaceDir, resolvedBy: "Update skills" });
        const after = yield* readOpenRecoveryRecords(workspaceDir);
        expect(after.length).toBe(0);
        // Append-only: the original record file survives beside its marker.
        const entries = fs.readdirSync(path.join(workspaceDir, "operations")).sort();
        expect(entries.some((entry) => entry.endsWith("-restoration-failure.json"))).toBe(true);
        expect(entries.some((entry) => entry.endsWith(".resolved.json"))).toBe(true);
      }).pipe(Effect.provide(services)),
  );

  it.effect("an absent or malformed records directory reads as no open records", () =>
    Effect.gen(function* () {
      const missing = yield* readOpenRecoveryRecords(workspaceDir);
      expect(missing).toEqual([]);
      fs.mkdirSync(path.join(workspaceDir, "operations"), { recursive: true });
      fs.writeFileSync(path.join(workspaceDir, "operations", "junk.json"), "not json");
      const withJunk = yield* readOpenRecoveryRecords(workspaceDir);
      expect(withJunk).toEqual([]);
    }).pipe(Effect.provide(services)),
  );
});
