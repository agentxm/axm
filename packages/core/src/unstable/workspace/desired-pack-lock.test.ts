import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";
import { decodeHandleSync } from "../extensions/index.js";
import type { Lockfile } from "../lockfile/index.js";
import { computePackManifestContentIdentity, type PackManifest } from "../packs/index.js";
import { TreeIntegritySchema } from "../extensions/materialized-tree.js";
import * as Schema from "effect/Schema";
import { decodeExtensionNameSync } from "../extensions/common.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import { validateDesiredPackLock } from "./desired-pack-lock.js";
import type { DesiredStateGraph } from "./desired-state-graph.js";

const owner = decodeHandleSync("@acme");
const name = decodeExtensionNameSync("toolkit");
const version = decodeVersionSync("1.0.0");
const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v1:${"0".repeat(64)}`,
);
const manifest = {
  owner,
  type: "pack",
  name,
  version,
  dependencies: {},
} satisfies PackManifest;

const externalPackGraph = {
  complete: true,
  nodes: [
    {
      type: "pack",
      name: "toolkit",
      identity: "@acme/packs/toolkit",
      source: "@acme/packs/toolkit",
      enabled: true,
      constraints: [],
      origins: [{ type: "settings", source: "@acme/packs/toolkit", enabled: true }],
    },
  ],
  problems: [],
} satisfies DesiredStateGraph;

const lockfile = (manifestContentIdentity = computePackManifestContentIdentity(manifest)) =>
  ({
    lockfileVersion: 6,
    skills: {},
    packs: {
      toolkit: {
        type: "registry",
        sourceType: "registry",
        endpoint: new URL("https://registry.agentxm.ai"),
        extensionType: "pack",
        workspaceName: name,
        packageFormat: "agentxm",
        owner,
        name,
        resolvedVersion: version,
        integrity: "sha512-test",
        sourceName: "agentxm",
        publisherBindingId: "hbnd_test",
        manifestContentIdentity,
        treeIntegrity,
      },
    },
  }) satisfies Lockfile;

describe("validateDesiredPackLock", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories) fs.rmSync(directory, { recursive: true });
    temporaryDirectories.length = 0;
  });

  const setupCanonicalPack = () => {
    const baseDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pack-lock-")));
    temporaryDirectories.push(baseDir);
    const canonical = path.join(
      baseDir,
      "agent_extensions",
      "agentxm",
      "@acme",
      "packs",
      "toolkit",
    );
    fs.mkdirSync(canonical, { recursive: true });
    fs.writeFileSync(path.join(canonical, "pack.json"), JSON.stringify(manifest));
    return { baseDir, canonical };
  };

  it.effect("fails closed when an external configured Pack lacks an accepted resolution", () =>
    Effect.gen(function* () {
      const { baseDir } = setupCanonicalPack();
      const validated = yield* validateDesiredPackLock({
        baseDir,
        graph: externalPackGraph,
        lockfile: { lockfileVersion: 6, skills: {} },
      });

      expect(validated.complete).toBe(false);
      expect(validated.problems).toContainEqual(
        expect.objectContaining({ type: "pack-resolution-unavailable" }),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("accepts decoded-equivalent Pack manifest formatting", () =>
    Effect.gen(function* () {
      const { baseDir, canonical } = setupCanonicalPack();
      fs.writeFileSync(
        path.join(canonical, "pack.json"),
        JSON.stringify(
          { dependencies: {}, version: "1.0.0", name: "toolkit", type: "pack", owner: "@acme" },
          null,
          2,
        ),
      );

      const validated = yield* validateDesiredPackLock({
        baseDir,
        graph: externalPackGraph,
        lockfile: lockfile(),
      });
      expect(validated.complete).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "rejects a Pack manifest semantic change without treating other files as authority",
    () =>
      Effect.gen(function* () {
        const { baseDir, canonical } = setupCanonicalPack();
        fs.writeFileSync(path.join(canonical, "README.md"), "locally edited\n");
        const withOtherDrift = yield* validateDesiredPackLock({
          baseDir,
          graph: externalPackGraph,
          lockfile: lockfile(),
        });
        expect(withOtherDrift.complete).toBe(true);

        fs.writeFileSync(
          path.join(canonical, "pack.json"),
          JSON.stringify({ ...manifest, dependencies: { "@evil/skills/injected": "*" } }),
        );
        const changed = yield* validateDesiredPackLock({
          baseDir,
          graph: externalPackGraph,
          lockfile: lockfile(),
        });
        expect(changed.complete).toBe(false);
        expect(changed.problems).toContainEqual(
          expect.objectContaining({ type: "pack-manifest-content-mismatch", status: "changed" }),
        );
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("does not require a lock row for a workspace-authored Pack", () =>
    Effect.gen(function* () {
      const { baseDir } = setupCanonicalPack();
      const graph: DesiredStateGraph = {
        ...externalPackGraph,
        nodes: externalPackGraph.nodes.map((node) => ({
          ...node,
          identity: "workspace:@acme/packs/toolkit",
          source: "workspace:@acme/packs/toolkit",
        })),
      };
      const validated = yield* validateDesiredPackLock({
        baseDir,
        graph,
        lockfile: { lockfileVersion: 6, skills: {} },
      });
      expect(validated.complete).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
