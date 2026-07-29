import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";
import { computePackageContentHash } from "../extensions/index.js";
import type { WorkspaceTrustState } from "../trust/index.js";
import { validateDesiredPackTrust } from "./desired-pack-trust.js";
import type { DesiredStateGraph } from "./desired-state-graph.js";

const packGraph = {
  complete: true,
  nodes: [
    {
      type: "pack",
      name: "toolkit",
      identity: "@acme/packs/toolkit",
      source: "@acme/packs/toolkit",
      enabled: true,
      constraints: [],
      origins: [
        {
          type: "settings",
          source: "@acme/packs/toolkit",
          enabled: true,
        },
      ],
    },
  ],
  problems: [],
} satisfies DesiredStateGraph;

describe("validateDesiredPackTrust", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
    temporaryDirectories.length = 0;
  });

  const setupCanonicalPack = () => {
    const baseDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pack-trust-")));
    temporaryDirectories.push(baseDir);
    const canonical = path.join(baseDir, ".axm", "extensions", "@acme", "packs", "toolkit");
    fs.mkdirSync(canonical, { recursive: true });
    fs.writeFileSync(
      path.join(canonical, "pack.json"),
      JSON.stringify({
        owner: "@acme",
        type: "pack",
        name: "toolkit",
        version: "1.0.0",
        dependencies: {},
      }),
    );
    return { baseDir, canonical };
  };

  it.effect("fails closed when a configured pack lacks a content trust baseline", () =>
    Effect.gen(function* () {
      const { baseDir } = setupCanonicalPack();
      const trust: WorkspaceTrustState = {
        trustStateVersion: 1,
        records: {
          "pack:toolkit": {
            extensionType: "pack",
            name: "toolkit",
            authority: "registry",
            sourceIdentity: "@acme/packs/toolkit",
            resolvedVersion: "1.0.0",
            publisherBindingId: "hbnd_test",
          },
        },
      };

      const validated = yield* validateDesiredPackTrust({
        baseDir,
        graph: packGraph,
        trust,
      });

      expect(validated.complete).toBe(false);
      expect(validated.problems).toContainEqual(
        expect.objectContaining({ type: "pack-trust-unavailable" }),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("detects canonical pack manifest modification after trust is established", () =>
    Effect.gen(function* () {
      const { baseDir, canonical } = setupCanonicalPack();
      const contentIdentity = yield* computePackageContentHash(canonical);
      const trust: WorkspaceTrustState = {
        trustStateVersion: 1,
        records: {
          "pack:toolkit": {
            extensionType: "pack",
            name: "toolkit",
            authority: "registry",
            sourceIdentity: "@acme/packs/toolkit",
            resolvedVersion: "1.0.0",
            publisherBindingId: "hbnd_test",
            contentIdentity,
          },
        },
      };

      const usable = yield* validateDesiredPackTrust({ baseDir, graph: packGraph, trust });
      expect(usable.complete).toBe(true);

      fs.writeFileSync(
        path.join(canonical, "pack.json"),
        JSON.stringify({
          owner: "@acme",
          type: "pack",
          name: "toolkit",
          version: "1.0.0",
          dependencies: { "@evil/skills/injected": "*" },
        }),
      );
      const modified = yield* validateDesiredPackTrust({ baseDir, graph: packGraph, trust });

      expect(modified.complete).toBe(false);
      expect(modified.problems).toContainEqual(
        expect.objectContaining({
          type: "pack-canonical-unusable",
          status: "locally-modified",
        }),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
