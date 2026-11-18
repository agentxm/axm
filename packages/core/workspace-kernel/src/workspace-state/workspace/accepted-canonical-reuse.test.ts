/**
 * The reuse decision hashes the canonical tree it judges, unless the
 * caller's own observation already found that exact root's digest different
 * from the same accepted integrity: then it refuses reuse without hashing.
 * A handed digest can only refuse reuse; any other root or accepted
 * integrity is hashed as usual. An observation hands over only a digest it
 * computed itself and found different.
 */

import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { afterEach, beforeEach } from "vitest";
import { workObservations } from "../../locations/testing.js";
import { extensionName, handle } from "../testing.js";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import * as Path from "effect/Path";
import {
  canonicalPathForAcceptedExtension,
  observeAcceptedCanonicalReuse,
  observeCanonicalExtensionCapturing,
} from "./canonical-observation.js";
import { UNCONSTRAINED_DESIRED_NODE, type DesiredExtensionNode } from "./desired-state-graph.js";
import { resolveProjectWorkspaceLayout } from "./layout.js";
import type { LockEntry } from "./lock-entry.js";
import { computeMaterializedTreeIntegrity, TreeIntegritySchema } from "./materialized-tree.js";

const otherIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v2:${"1".repeat(64)}`,
);

layer(NodeServices.layer, { excludeTestServices: true })("accepted canonical reuse", (it) => {
  let root: string;

  beforeEach(() => {
    root = nodeFs.realpathSync(nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-reuse-")));
  });
  afterEach(() => nodeFs.rmSync(root, { recursive: true, force: true }));

  const decide = (
    mismatch: (
      canonicalPath: string,
      accepted: LockEntry,
    ) => Parameters<typeof observeAcceptedCanonicalReuse>[0]["observedMismatch"],
    force = false,
  ) =>
    Effect.gen(function* () {
      const canonicalPath = nodePath.join(root, "review");
      nodeFs.mkdirSync(canonicalPath);
      nodeFs.writeFileSync(nodePath.join(canonicalPath, "SKILL.md"), "# Review\n");
      const treeIntegrity = yield* computeMaterializedTreeIntegrity(canonicalPath);
      const accepted: LockEntry = {
        source: { type: "path", path: "review" },
        identity: { owner: handle("@acme"), name: extensionName("review") },
        resolved: { tree: treeIntegrity },
        treeIntegrity,
      };
      const observedMismatch = mismatch(canonicalPath, accepted);
      const work = workObservations(false);
      const reusable = yield* observeAcceptedCanonicalReuse({
        canonicalPath,
        requested: { refType: "local", name: "review" },
        accepted: Option.some(accepted),
        force,
        ...(observedMismatch === undefined ? {} : { observedMismatch }),
      }).pipe(work.provide);
      return {
        reusable,
        treeIntegrity,
        hashes: work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree").length,
      };
    });

  it.effect("hashes the tree it judges when nothing is handed over", () =>
    Effect.gen(function* () {
      const decided = yield* decide(() => undefined);
      expect(decided.reusable).toEqual(Option.some(decided.treeIntegrity));
      expect(decided.hashes).toBe(1);
    }),
  );

  it.effect("refuses reuse from a differing digest of the same root and integrity", () =>
    Effect.gen(function* () {
      const decided = yield* decide((canonicalPath, accepted) => ({
        root: canonicalPath,
        acceptedIntegrity: accepted.treeIntegrity,
        observed: otherIntegrity,
      }));
      expect(decided.reusable).toEqual(Option.none());
      expect(decided.hashes).toBe(0);
    }),
  );

  it.effect("hashes again for a digest of another root", () =>
    Effect.gen(function* () {
      const decided = yield* decide((canonicalPath, accepted) => ({
        root: `${canonicalPath}-alias`,
        acceptedIntegrity: accepted.treeIntegrity,
        observed: otherIntegrity,
      }));
      expect(decided.reusable).toEqual(Option.some(decided.treeIntegrity));
      expect(decided.hashes).toBe(1);
    }),
  );

  it.effect("hashes again for a digest judged against another accepted integrity", () =>
    Effect.gen(function* () {
      const decided = yield* decide((canonicalPath, accepted) => ({
        root: canonicalPath,
        acceptedIntegrity: otherIntegrity,
        observed: accepted.treeIntegrity,
      }));
      expect(decided.reusable).toEqual(Option.some(decided.treeIntegrity));
      expect(decided.hashes).toBe(1);
    }),
  );

  it.effect("keeps every gate before the handed digest", () =>
    Effect.gen(function* () {
      const decided = yield* decide(() => undefined, true);
      expect(decided.reusable).toEqual(Option.none());
      expect(decided.hashes).toBe(0);
    }),
  );

  const source = "github:acme/tools//skills/review@main";
  const desired: DesiredExtensionNode = {
    type: "skill",
    name: "review",
    identity: { authority: "git", locator: source },
    source,
    enabled: true,
    constraint: UNCONSTRAINED_DESIRED_NODE,
    origins: [{ type: "settings", source, enabled: true }],
  };
  const acceptedGit = (treeIntegrity: LockEntry["treeIntegrity"]): LockEntry => ({
    source: {
      type: "git",
      url: new URL("https://github.com/acme/tools.git"),
      revision: "main",
      path: "skills/review",
    },
    identity: { owner: handle("@acme"), name: extensionName("review") },
    resolved: { commit: "commit-1", tree: "tree-1" },
    treeIntegrity,
  });

  /** Observe an accepted Git Skill whose tree `drift` changes after acceptance. */
  const observeDrifted = (
    drift: (canonical: string) => void,
    verified = false,
    retainTreeWalk = false,
  ) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const layout = yield* resolveProjectWorkspaceLayout(makeAbsolutePath(path, root), {
        owner: handle("@acme"),
      });
      const canonical = canonicalPathForAcceptedExtension(
        path,
        layout,
        desired,
        acceptedGit(otherIntegrity),
      );
      if (canonical === undefined) return yield* Effect.die("Expected a canonical root");
      nodeFs.mkdirSync(nodePath.join(canonical, "src"), { recursive: true });
      nodeFs.writeFileSync(
        nodePath.join(canonical, "skill.json"),
        JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
      );
      nodeFs.writeFileSync(nodePath.join(canonical, "src", "SKILL.md"), "# Review\n");
      const accepted = acceptedGit(yield* computeMaterializedTreeIntegrity(canonical));
      drift(canonical);
      const capture = yield* observeCanonicalExtensionCapturing({
        layout,
        desired,
        accepted,
        ...(retainTreeWalk ? { retainTreeWalk } : {}),
        ...(verified
          ? {
              verifiedTree: {
                root: canonical,
                accepted,
                integrity: yield* computeMaterializedTreeIntegrity(canonical),
              },
            }
          : {}),
      });
      return { capture, canonical, accepted };
    });

  const editSkill = (canonical: string) =>
    nodeFs.writeFileSync(nodePath.join(canonical, "src", "SKILL.md"), "# Edited\n");

  it.effect("hands over the differing digest its own walk computed", () =>
    Effect.gen(function* () {
      const { capture, canonical, accepted } = yield* observeDrifted(editSkill);
      expect(capture.observation.status).toBe("materialization-mismatch");
      expect(capture.mismatchedTree).toEqual({
        root: canonical,
        acceptedIntegrity: accepted.treeIntegrity,
        observed: yield* computeMaterializedTreeIntegrity(canonical),
      });
      expect(Object.isFrozen(capture.mismatchedTree)).toBe(true);
    }),
  );

  it.effect("hands over nothing when its walk failed", () =>
    Effect.gen(function* () {
      const { capture } = yield* observeDrifted((canonical) => {
        nodeFs.writeFileSync(nodePath.join(canonical, "src", "notes.md"), "a");
        nodeFs.writeFileSync(nodePath.join(canonical, "src", "NOTES.md"), "b");
      });
      expect(capture.observation.status).toBe("materialization-mismatch");
      expect(capture.mismatchedTree).toBeUndefined();
    }),
  );

  it.effect("hands over nothing when a verified digest stood for its walk", () =>
    Effect.gen(function* () {
      const { capture } = yield* observeDrifted(editSkill, true);
      expect(capture.observation.status).toBe("materialization-mismatch");
      expect(capture.mismatchedTree).toBeUndefined();
    }),
  );

  it.effect("hands out its strict walk only from a usable observation that asked for it", () =>
    Effect.gen(function* () {
      const usable = yield* observeDrifted(() => undefined, false, true);
      expect(usable.capture.observation.status).toBe("usable");
      expect(usable.capture.treeWalk?.names("src")).toEqual(["SKILL.md"]);
      const unrequested = yield* observeDrifted(() => undefined);
      expect(unrequested.capture.treeWalk).toBeUndefined();
      const drifted = yield* observeDrifted(editSkill, false, true);
      expect(drifted.capture.observation.status).toBe("materialization-mismatch");
      expect(drifted.capture.treeWalk).toBeUndefined();
      expect(drifted.capture.mismatchedTree?.root).toBe(drifted.canonical);
      const verified = yield* observeDrifted(() => undefined, true, true);
      expect(verified.capture.observation.status).toBe("usable");
      expect(verified.capture.treeWalk).toBeUndefined();
    }),
  );
});
