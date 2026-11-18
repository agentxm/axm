/**
 * Observing an accepted Skill without an owner judges its SKILL.md readable
 * and its tree accepted. The strict walk that hashes the tree reads SKILL.md
 * itself, so a walk that matched and read it at that exact path stands for
 * the readability read; every other case reads SKILL.md as before, and an
 * unreadable SKILL.md is still corrupt before the tree is judged.
 */

import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { afterEach, beforeEach } from "vitest";
import { makeRecordingFileSystem, type FileSystemRecording } from "@agentxm/test-support";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import { workObservations } from "../../locations/testing.js";
import { extensionName, handle } from "../testing.js";
import {
  canonicalPathForAcceptedExtension,
  observeCanonicalExtension,
  type CanonicalObservationStatus,
} from "./canonical-observation.js";
import { UNCONSTRAINED_DESIRED_NODE, type DesiredExtensionNode } from "./desired-state-graph.js";
import { resolveProjectWorkspaceLayout } from "./layout.js";
import type { LockEntry } from "./lock-entry.js";
import { computeMaterializedTreeIntegrity, TreeIntegritySchema } from "./materialized-tree.js";

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

const placeholderTreeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v2:${"0".repeat(64)}`,
);

const acceptedRow = (treeIntegrity: LockEntry["treeIntegrity"]): LockEntry => ({
  source: {
    type: "git",
    url: new URL("https://github.com/acme/tools.git"),
    revision: "main",
    path: "skills/review",
    distribution: { format: "claude", packageRoot: ".", componentPath: "src" },
  },
  identity: { name: extensionName("review") },
  resolved: { commit: "commit-1", tree: "tree-1" },
  treeIntegrity,
});

layer(NodeServices.layer, { excludeTestServices: true })("portable Skill observation", (it) => {
  let root: string;

  beforeEach(() => {
    root = nodeFs.realpathSync(
      nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-portable-skill-")),
    );
  });
  afterEach(() => nodeFs.rmSync(root, { recursive: true, force: true }));

  /**
   * Lay out the canonical tree with `prepare`, accept the tree it leaves,
   * apply `drift`, then observe once through a recording filesystem.
   */
  const observe = (options: {
    readonly prepare: (canonical: string) => void;
    readonly drift?: (canonical: string) => void;
    readonly verified?: boolean;
  }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const layout = yield* resolveProjectWorkspaceLayout(makeAbsolutePath(path, root), {
        owner: handle("@acme"),
      });
      const canonical = canonicalPathForAcceptedExtension(
        path,
        layout,
        desired,
        acceptedRow(placeholderTreeIntegrity),
      );
      if (canonical === undefined) return yield* Effect.die("Expected a portable canonical root");
      nodeFs.mkdirSync(canonical, { recursive: true });
      options.prepare(canonical);
      const accepted = acceptedRow(yield* computeMaterializedTreeIntegrity(canonical));
      options.drift?.(canonical);
      const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
      const work = workObservations(false);
      const observation = yield* observeCanonicalExtension({
        layout,
        desired,
        accepted,
        ...(options.verified === true
          ? {
              verifiedTree: {
                root: canonical,
                accepted,
                integrity: yield* computeMaterializedTreeIntegrity(canonical),
              },
            }
          : {}),
      }).pipe(work.provide, Effect.provideService(FileSystem.FileSystem, fileSystem));
      return {
        status: observation.status,
        skillMd: nodePath.join(canonical, "src", "SKILL.md"),
        recording,
        treeHashes: work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree").length,
      };
    });

  const writeSkill = (canonical: string) => {
    nodeFs.mkdirSync(nodePath.join(canonical, "src"), { recursive: true });
    nodeFs.writeFileSync(nodePath.join(canonical, "src", "SKILL.md"), "# Review\n");
    nodeFs.writeFileSync(nodePath.join(canonical, "README.md"), "Readme\n");
  };

  const reads = (recording: FileSystemRecording, file: string) =>
    recording.calls({ path: file, method: "readFile" }).length;

  it.effect("reads SKILL.md once when the walk that matched read it", () =>
    Effect.gen(function* () {
      const observed = yield* observe({ prepare: writeSkill });
      expect(observed.status).toBe<CanonicalObservationStatus>("usable");
      expect(reads(observed.recording, observed.skillMd)).toBe(1);
      expect(observed.recording.calls({ path: observed.skillMd, method: "access" })).toHaveLength(
        1,
      );
      expect(observed.treeHashes).toBe(1);
    }),
  );

  it.effect("still reads an edited SKILL.md before judging the tree a mismatch", () =>
    Effect.gen(function* () {
      const observed = yield* observe({
        prepare: writeSkill,
        drift: (canonical) =>
          nodeFs.writeFileSync(nodePath.join(canonical, "src", "SKILL.md"), "# Edited\n"),
      });
      expect(observed.status).toBe<CanonicalObservationStatus>("materialization-mismatch");
      expect(reads(observed.recording, observed.skillMd)).toBe(2);
      expect(observed.treeHashes).toBe(1);
    }),
  );

  it.effect("reads SKILL.md itself when a verified digest stands for the walk", () =>
    Effect.gen(function* () {
      const observed = yield* observe({ prepare: writeSkill, verified: true });
      expect(observed.status).toBe<CanonicalObservationStatus>("usable");
      expect(reads(observed.recording, observed.skillMd)).toBe(1);
      expect(observed.treeHashes).toBe(0);
    }),
  );

  it.effect("judges a directory named SKILL.md corrupt", () =>
    Effect.gen(function* () {
      const observed = yield* observe({
        prepare: (canonical) =>
          nodeFs.mkdirSync(nodePath.join(canonical, "src", "SKILL.md"), {
            recursive: true,
          }),
      });
      expect(observed.status).toBe<CanonicalObservationStatus>("corrupt");
    }),
  );

  it.effect("judges a contained link from SKILL.md to a directory corrupt, not usable", () =>
    Effect.gen(function* () {
      const observed = yield* observe({
        prepare: (canonical) => {
          nodeFs.mkdirSync(nodePath.join(canonical, "src", "docs"), { recursive: true });
          nodeFs.writeFileSync(nodePath.join(canonical, "src", "docs", "guide.md"), "Guide\n");
          nodeFs.symlinkSync("docs", nodePath.join(canonical, "src", "SKILL.md"));
        },
      });
      expect(observed.status).toBe<CanonicalObservationStatus>("corrupt");
    }),
  );

  it.effect("judges a missing SKILL.md incomplete without hashing", () =>
    Effect.gen(function* () {
      const observed = yield* observe({
        prepare: (canonical) => nodeFs.writeFileSync(nodePath.join(canonical, "README.md"), "x"),
      });
      expect(observed.status).toBe<CanonicalObservationStatus>("incomplete");
      expect(observed.treeHashes).toBe(0);
    }),
  );
});
