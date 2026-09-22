import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { defineSpecification } from "@agentxm/specification-metadata";
import { discoverExtensionPackages } from "./package-discovery.js";

export const specification = defineSpecification({
  requirement: "extension-discovery/broad-scans-skip-tool-caches",
  title: "Broad source discovery skips tool caches without hiding explicit roots",
  statement:
    "When discovering extension packages from a source, AXM shall omit .nx cache trees from broad convention scans and shall still discover a package when its directory is explicitly selected as the source root.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "trustworthy-distribution"],
  methods: ["example"],
  derivedFrom: ["extension-discovery/all-manifest-kinds-from-git-and-path"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Broad source discovery and explicit roots", () => {
  const roots: Array<string> = [];

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it.effect("omits the Nx cache in a broad scan but discovers an explicit package inside it", () =>
    Effect.gen(function* () {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-source-cache-scan-"));
      roots.push(root);
      const packageRoot = path.join(root, ".nx", "cache", "authored-skill");
      fs.mkdirSync(packageRoot, { recursive: true });
      fs.writeFileSync(
        path.join(packageRoot, "skill.json"),
        JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
      );
      const filter = { names: [], owner: Option.none(), type: "*" } as const;

      const broad = yield* discoverExtensionPackages(root, filter).pipe(
        Effect.provide(NodeServices.layer),
      );
      const explicit = yield* discoverExtensionPackages(packageRoot, filter).pipe(
        Effect.provide(NodeServices.layer),
      );

      expect(broad).toEqual([]);
      expect(explicit).toHaveLength(1);
      expect(explicit[0]).toMatchObject({ kind: "manifest", directory: packageRoot });
    }),
  );
});
