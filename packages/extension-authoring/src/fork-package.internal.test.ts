import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { ForkPackageInvalid } from "@agentxm/extension-workspace";

import { extensionName, handle } from "./test-helpers.js";
import { forkExtensionPackage } from "./fork-package.js";

const readJson = (filePath: string): unknown => JSON.parse(fs.readFileSync(filePath, "utf8"));

describe("forkExtensionPackage", () => {
  let tempDir: string;
  let sourceDir: string;
  let targetDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-fork-package-"));
    sourceDir = path.join(tempDir, "source");
    targetDir = path.join(tempDir, "target");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("rewrites skill package identity and preserves content metadata", () =>
    Effect.gen(function* () {
      fs.mkdirSync(path.join(sourceDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(sourceDir, "skill.json"),
        `${JSON.stringify({
          owner: "@source",
          type: "skill",
          name: "review",
          version: "4.2.0",
          license: "MIT",
          dependencies: { "@source/skills/helper": "^1.0.0" },
        })}\n`,
      );
      fs.writeFileSync(
        path.join(sourceDir, "src", "SKILL.md"),
        "---\nname: review\ndescription: Review code\n---\n\n# Review\n",
      );

      yield* forkExtensionPackage({
        sourceDir,
        targetDir,
        sourceIdentity: {
          owner: handle("@source"),
          type: "skill",
          name: extensionName("review"),
          version: "4.2.0",
        },
        target: {
          owner: handle("@target"),
          type: "skill",
          name: extensionName("review-plus"),
        },
      }).pipe(Effect.provide(NodeServices.layer));

      expect(readJson(path.join(targetDir, "skill.json"))).toMatchObject({
        owner: "@target",
        type: "skill",
        name: "review-plus",
        version: "0.1.0",
        license: "MIT",
        dependencies: { "@source/skills/helper": "^1.0.0" },
      });
      expect(fs.readFileSync(path.join(targetDir, "src", "SKILL.md"), "utf8")).toContain(
        "name: review-plus",
      );
    }),
  );

  it.effect("renames subagent content and its frontmatter identity", () =>
    Effect.gen(function* () {
      fs.mkdirSync(path.join(sourceDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(sourceDir, "subagent.json"),
        `${JSON.stringify({
          owner: "@source",
          type: "subagent",
          name: "researcher",
          version: "1.0.0",
        })}\n`,
      );
      fs.writeFileSync(
        path.join(sourceDir, "src", "researcher.md"),
        "---\nname: researcher\nmodel: fast\n---\n\nResearch carefully.\n",
      );

      yield* forkExtensionPackage({
        sourceDir,
        targetDir,
        sourceIdentity: {
          owner: handle("@source"),
          type: "subagent",
          name: extensionName("researcher"),
          version: "1.0.0",
        },
        target: {
          owner: handle("@target"),
          type: "subagent",
          name: extensionName("investigator"),
        },
      }).pipe(Effect.provide(NodeServices.layer));

      expect(fs.existsSync(path.join(targetDir, "src", "researcher.md"))).toBe(false);
      const content = fs.readFileSync(path.join(targetDir, "src", "investigator.md"), "utf8");
      expect(content).toContain("name: investigator");
      expect(content).toContain("model: fast");
      expect(content).toContain("Research carefully.");
    }),
  );

  it.effect("shallow-forks a pack without changing its dependencies", () =>
    Effect.gen(function* () {
      fs.mkdirSync(sourceDir, { recursive: true });
      const dependencies = {
        "@source/skills/review": "^2.0.0",
        "@source/hooks/audit": "~1.0.0",
      };
      fs.writeFileSync(
        path.join(sourceDir, "pack.json"),
        `${JSON.stringify({
          owner: "@source",
          type: "pack",
          name: "starter",
          version: "3.0.0",
          dependencies,
        })}\n`,
      );

      yield* forkExtensionPackage({
        sourceDir,
        targetDir,
        sourceIdentity: {
          owner: handle("@source"),
          type: "pack",
          name: extensionName("starter"),
          version: "3.0.0",
        },
        target: {
          owner: handle("@target"),
          type: "pack",
          name: extensionName("starter-copy"),
        },
      }).pipe(Effect.provide(NodeServices.layer));

      expect(readJson(path.join(targetDir, "pack.json"))).toMatchObject({
        owner: "@target",
        name: "starter-copy",
        version: "0.1.0",
        dependencies,
      });
    }),
  );

  const identityOnlyCases = [
    {
      type: "mcp-server",
      manifestFile: "mcp.json",
      sourceName: "browser",
      targetName: "browser-custom",
      manifestFields: {
        server: {
          name: "io.agentxm/browser",
          description: "Browser MCP server",
          version: "1.0.0",
        },
      },
    },
    {
      type: "rule",
      manifestFile: "rule.json",
      sourceName: "policy",
      targetName: "policy-custom",
      manifestFields: {},
    },
    {
      type: "hook",
      manifestFile: "hook.json",
      sourceName: "audit",
      targetName: "audit-custom",
      manifestFields: {
        runtime: "bash",
        entrypoint: "src/hook.sh",
        bindings: [{ on: "turn.end", requires: { decision: { kind: "block" } } }],
      },
    },
    {
      type: "knowledge",
      manifestFile: "knowledge.json",
      sourceName: "handbook",
      targetName: "handbook-custom",
      manifestFields: { format: { name: "okf", version: "0.2" }, bundleRoot: "src" },
    },
  ] as const;

  for (const testCase of identityOnlyCases) {
    it.effect(`rewrites ${testCase.type} package identity`, () =>
      Effect.gen(function* () {
        fs.mkdirSync(sourceDir, { recursive: true });
        fs.writeFileSync(
          path.join(sourceDir, testCase.manifestFile),
          `${JSON.stringify({
            owner: "@source",
            type: testCase.type,
            name: testCase.sourceName,
            version: "1.0.0",
            ...testCase.manifestFields,
          })}\n`,
        );

        yield* forkExtensionPackage({
          sourceDir,
          targetDir,
          sourceIdentity: {
            owner: handle("@source"),
            type: testCase.type,
            name: extensionName(testCase.sourceName),
            version: "1.0.0",
          },
          target: {
            owner: handle("@target"),
            type: testCase.type,
            name: extensionName(testCase.targetName),
          },
        }).pipe(Effect.provide(NodeServices.layer));

        expect(readJson(path.join(targetDir, testCase.manifestFile))).toMatchObject({
          owner: "@target",
          type: testCase.type,
          name: testCase.targetName,
          version: "0.1.0",
          ...testCase.manifestFields,
        });
      }),
    );
  }

  it.effect("rejects cross-type forks before copying", () =>
    Effect.gen(function* () {
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(
        path.join(sourceDir, "skill.json"),
        `${JSON.stringify({
          owner: "@source",
          type: "skill",
          name: "review",
          version: "1.0.0",
        })}\n`,
      );

      const error = yield* Effect.flip(
        forkExtensionPackage({
          sourceDir,
          targetDir,
          sourceIdentity: {
            owner: handle("@source"),
            type: "skill",
            name: extensionName("review"),
            version: "1.0.0",
          },
          target: {
            owner: handle("@target"),
            type: "rule",
            name: extensionName("review"),
          },
        }).pipe(Effect.provide(NodeServices.layer)),
      );

      expect(error).toBeInstanceOf(ForkPackageInvalid);
      expect(fs.existsSync(targetDir)).toBe(false);
    }),
  );
});
