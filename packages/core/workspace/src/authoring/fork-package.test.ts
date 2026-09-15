import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

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
});
