import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { WorkspaceFileWriteLocksLive } from "../../transitions/settlement/live.js";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { defineSpecification } from "@agentxm/specification-metadata";

import { WorkspaceStateLive } from "../live.js";
import * as Option from "effect/Option";
import { acceptedRowKey, desiredReachesAcceptedRow } from "./accepted-reachability.js";
import { DesiredStateReader } from "./desired-state-reader.js";
import { WorkspaceRecords } from "./workspace-records.js";
import { deriveOperationOutcome } from "../../transitions/planning/index.js";
import { makeLifecycleFixture } from "../../lifecycle/testing.js";
import { applyUninstall, uninstallRequest } from "../../lifecycle/uninstall/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/lock-state-never-creates-reachability",
  title: "A lockfile row alone never makes an extension desired or retained",
  statement:
    "An accepted-resolution row in the lockfile that no settings entry desires shall not cause the workspace to acquire, realize, or report that extension or pack as present.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "trustworthy-distribution"],
  boundary: "memory",
  boundaryRationale:
    "Reachability is decided where desired state is read: the settings entries and the accepted resolutions are both on disk, and the records built from them are what every command downstream consults.",
  methods: ["decision-table", "contract"],
  derivedFrom: [
    "packages/core/workspace/src/reconciliation/sync/lock-only-rows-are-never-acquired.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** Exactly what an accepted Registry resolution records, for one extension. */
const acceptedRegistryRow = (
  name: string,
  extensionType: "skill" | "pack",
): Readonly<Record<string, unknown>> => ({
  source: { type: "registry", url: "https://registry.agentxm.ai" },
  identity: { owner: "@acme", name },
  resolved: {
    version: "1.0.0",
    integrity: "sha512-AAAA==",
    publisherBindingId: "hbnd_test",
  },
  treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
  ...(extensionType === "pack"
    ? { manifestVersion: "1.0.0", manifestContentIdentity: "test-content", members: [] }
    : {}),
});

/**
 * Accepted-resolution rows written directly into the authoritative lockfile
 * with no corresponding settings entry: nothing desires the extension.
 */
const lockOnlyRows = [
  {
    family: "extension",
    name: "phantom",
    lockfile: { skills: { phantom: acceptedRegistryRow("phantom", "skill") } },
  },
  {
    family: "pack",
    name: "phantom-pack",
    lockfile: {
      skills: {},
      packs: { "phantom-pack": acceptedRegistryRow("phantom-pack", "pack") },
    },
  },
] as const;

const makeWorkspace = (
  lockfile: Readonly<Record<string, unknown>>,
  settings: Readonly<Record<string, unknown>> = {},
) => {
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-lock-only-")));
  fs.mkdirSync(nodePath.join(root, ".axm"), { recursive: true });
  fs.writeFileSync(
    nodePath.join(root, "axm.json"),
    `${JSON.stringify({ owner: "@acme", agents: [], ...settings }, null, 2)}\n`,
  );
  // JSON is valid YAML, so the lockfile fixture needs no emitter.
  fs.writeFileSync(
    nodePath.join(root, "axm-lock.yaml"),
    JSON.stringify({ lockfileVersion: 8, skills: {}, ...lockfile }),
  );
  return {
    root,
    layer: WorkspaceStateLive({ scope: "project", projectRoot: decodeAbsolutePathSync(root) }).pipe(
      Layer.provide(WorkspaceFileWriteLocksLive),
    ),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
};

describe("Lock state and desired-state reachability", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(lockOnlyRows)("desired state excludes a lock-only $family", (row) =>
    Effect.gen(function* () {
      const workspace = makeWorkspace(row.lockfile);
      cleanups.push(workspace.cleanup);

      const desired = yield* Effect.provide(
        Effect.flatMap(DesiredStateReader, (reader) => reader.graph()),
        workspace.layer,
      );

      // Nothing desires it, so no node carries it and nothing downstream can
      // reach it to acquire or realize it.
      expect(desired.nodes.map((node) => node.name)).not.toContain(row.name);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("a workspace-authored declaration never reaches an acquired row of its name", () =>
    Effect.gen(function* () {
      const workspace = makeWorkspace(
        { skills: { review: acceptedRegistryRow("review", "skill") } },
        { skills: { review: { source: "workspace", enabled: true } } },
      );
      cleanups.push(workspace.cleanup);

      const desired = yield* Effect.provide(
        Effect.flatMap(DesiredStateReader, (reader) => reader.graph()),
        workspace.layer,
      );
      const node = desired.nodes.find((candidate) => candidate.name === "review");

      // The workspace is authoritative for the package, so the stale external
      // row is unreached: sync retires it, and the same predicate says so to
      // lint and to the install-root inventory.
      expect(node?.identity).toEqual({ authority: "workspace", fqn: "@acme/skills/review" });
      expect(node && Option.isNone(acceptedRowKey(node))).toBe(true);
      expect(desiredReachesAcceptedRow(desired, { type: "skill", key: "review" })).toBe(false);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("a lock-only Knowledge row is not a removal target", () =>
    Effect.gen(function* () {
      const workspace = makeLifecycleFixture({
        settings: { owner: "@acme", agents: [] },
        lockfile: { knowledge: { "phantom-notes": acceptedRegistryRow("phantom-notes", "skill") } },
      });
      cleanups.push(workspace.cleanup);
      const lockBefore = workspace.readFile("axm-lock.yaml");

      const resolution = yield* workspace.provide(
        applyUninstall(uninstallRequest({ type: "knowledge", selector: "phantom-notes" })),
      );

      // Nothing desires or holds the bundle, so there is nothing to remove;
      // the stale row is sync's leftover to retire, not a removal's authority.
      expect(deriveOperationOutcome(resolution)).toBe("no-op");
      expect(workspace.readFile("axm-lock.yaml")).toBe(lockBefore);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect.each(lockOnlyRows)(
    "the workspace inventory does not report a lock-only $family as present",
    (row) =>
      Effect.gen(function* () {
        const workspace = makeWorkspace(row.lockfile);
        cleanups.push(workspace.cleanup);

        const rows = yield* Effect.provide(
          Effect.flatMap(WorkspaceRecords, (records) =>
            records.rows(row.family === "pack" ? "pack" : "skill"),
          ),
          workspace.layer,
        );

        expect(rows.map((entry) => entry.name)).not.toContain(row.name);
        expect(rows).toEqual([]);
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});
