import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { defineSpecification } from "@agentxm/specification-metadata";

import { WorkspaceStateLive } from "../live.js";
import { DesiredStateReader } from "./desired-state-reader.js";
import { WorkspaceMutations } from "./service-interface.js";

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
  derivedFrom: ["packages/core/workspace-sync/src/lock-only-rows-are-never-acquired.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** Exactly what an accepted Registry resolution records, for one extension. */
const acceptedRegistryRow = (
  name: string,
  extensionType: "skill" | "pack",
): Readonly<Record<string, unknown>> => ({
  type: "registry",
  sourceType: "registry",
  sourceName: "agentxm",
  endpoint: "https://registry.agentxm.ai",
  extensionType,
  workspaceName: name,
  packageFormat: "agentxm",
  owner: "@acme",
  name,
  resolvedVersion: "1.0.0",
  integrity: "sha512-AAAA==",
  publisherBindingId: "hbnd_test",
  treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
  ...(extensionType === "pack" ? { manifestContentIdentity: "test-content" } : {}),
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

const makeWorkspace = (lockfile: Readonly<Record<string, unknown>>) => {
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-lock-only-")));
  fs.mkdirSync(nodePath.join(root, ".axm"), { recursive: true });
  fs.writeFileSync(
    nodePath.join(root, "axm.json"),
    `${JSON.stringify({ owner: "@acme", agents: [] }, null, 2)}\n`,
  );
  // JSON is valid YAML, so the lockfile fixture needs no emitter.
  fs.writeFileSync(
    nodePath.join(root, "axm-lock.yaml"),
    JSON.stringify({ lockfileVersion: 7, skills: {}, ...lockfile }),
  );
  return {
    root,
    layer: WorkspaceStateLive({ scope: "project", projectRoot: decodeAbsolutePathSync(root) }),
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

  it.effect.each(lockOnlyRows)(
    "the workspace inventory does not report a lock-only $family as present",
    (row) =>
      Effect.gen(function* () {
        const workspace = makeWorkspace(row.lockfile);
        cleanups.push(workspace.cleanup);

        const rows = yield* Effect.provide(
          Effect.flatMap(WorkspaceMutations, (state) =>
            state.records.rows(row.family === "pack" ? "pack" : "skill"),
          ),
          workspace.layer,
        );

        expect(rows.map((entry) => entry.name)).not.toContain(row.name);
        expect(rows).toEqual([]);
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});
