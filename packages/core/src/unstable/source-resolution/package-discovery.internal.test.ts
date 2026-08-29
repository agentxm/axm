import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { decodeHandleSync } from "../extensions/index.js";
import { discoverExtensionPackages } from "./package-discovery.js";

const writeManifest = (dir: string, fileName: string, manifest: unknown) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), `${JSON.stringify(manifest, null, 2)}\n`);
};

describe("discoverExtensionPackages", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-package-discovery-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("discovers valid packages of every requested type by manifest identity", () =>
    Effect.gen(function* () {
      writeManifest(path.join(tempDir, "skill-package"), "skill.json", {
        owner: "@acme",
        type: "skill",
        name: "review",
        version: "1.2.3",
      });
      writeManifest(path.join(tempDir, "pack-package"), "pack.json", {
        owner: "@acme",
        type: "pack",
        name: "starter",
        version: "2.0.0",
        dependencies: { "@acme/skills/review": "^1.0.0" },
      });
      writeManifest(path.join(tempDir, "mcp-package"), "mcp.json", {
        owner: "@acme",
        type: "mcp-server",
        name: "browser",
        version: "1.0.0",
        server: {
          name: "io.agentxm/browser",
          description: "Browser MCP server",
          version: "1.0.0",
        },
      });
      writeManifest(path.join(tempDir, "subagent-package"), "subagent.json", {
        owner: "@acme",
        type: "subagent",
        name: "researcher",
        version: "1.0.0",
      });
      writeManifest(path.join(tempDir, "rule-package"), "rule.json", {
        owner: "@acme",
        type: "rule",
        name: "policy",
        version: "1.0.0",
      });
      writeManifest(path.join(tempDir, "hook-package"), "hook.json", {
        owner: "@acme",
        type: "hook",
        name: "audit",
        version: "1.0.0",
        runtime: "bash",
        entrypoint: "src/hook.sh",
        bindings: [{ on: "turn.end", requires: { decision: { kind: "block" } } }],
      });
      writeManifest(path.join(tempDir, "knowledge-package"), "knowledge.json", {
        owner: "@acme",
        type: "knowledge",
        name: "handbook",
        version: "1.0.0",
        format: { name: "okf", version: "0.2" },
        bundleRoot: "src",
      });

      const discovered = yield* discoverExtensionPackages(tempDir, {
        names: [],
        owner: Option.none(),
        type: "*",
      }).pipe(Effect.provide(NodeServices.layer));

      expect(discovered.map((candidate) => candidate.identity.type).sort()).toStrictEqual([
        "hook",
        "knowledge",
        "mcp-server",
        "pack",
        "rule",
        "skill",
        "subagent",
      ]);
    }),
  );

  it.effect("filters by source FQN components", () =>
    Effect.gen(function* () {
      writeManifest(path.join(tempDir, "one"), "skill.json", {
        owner: "@acme",
        type: "skill",
        name: "review",
        version: "1.0.0",
      });
      writeManifest(path.join(tempDir, "two"), "skill.json", {
        owner: "@other",
        type: "skill",
        name: "review",
        version: "1.0.0",
      });

      const discovered = yield* discoverExtensionPackages(tempDir, {
        names: ["review"],
        owner: Option.some(decodeHandleSync("@acme")),
        type: "skill",
      }).pipe(Effect.provide(NodeServices.layer));

      expect(discovered).toHaveLength(1);
      expect(discovered[0]?.identity.owner).toBe("@acme");
    }),
  );

  it.effect("does not classify native content as an AXM package", () =>
    Effect.gen(function* () {
      const nativeSkill = path.join(tempDir, "native-skill");
      fs.mkdirSync(nativeSkill, { recursive: true });
      fs.writeFileSync(
        path.join(nativeSkill, "SKILL.md"),
        "---\nname: native-skill\ndescription: Native only\n---\n",
      );

      const discovered = yield* discoverExtensionPackages(tempDir, {
        names: [],
        owner: Option.none(),
        type: "*",
      }).pipe(Effect.provide(NodeServices.layer));

      expect(discovered).toStrictEqual([]);
    }),
  );

  it.effect("fails closed when a manifest-shaped package is invalid", () =>
    Effect.gen(function* () {
      writeManifest(path.join(tempDir, "invalid"), "pack.json", {
        owner: "@acme",
        type: "pack",
        name: "starter",
        version: "1.0.0",
      });

      const error = yield* Effect.flip(
        discoverExtensionPackages(tempDir, {
          names: [],
          owner: Option.none(),
          type: "*",
        }).pipe(Effect.provide(NodeServices.layer)),
      );

      expect(error.code).toBe("validation");
      expect(error.detail).toContain("pack.json");
    }),
  );
});
