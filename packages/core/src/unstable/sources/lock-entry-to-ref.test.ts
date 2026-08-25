import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { SkillLockEntrySchema } from "../lockfile/index.js";
import type { SourceHostConfig } from "../settings/index.js";
import { skillLockEntryToRef } from "./lock-entry-to-ref.js";

const entry = Schema.decodeUnknownSync(SkillLockEntrySchema)({
  type: "github",
  sourceType: "github",
  sourceName: "github",
  endpoint: "https://github.com",
  extensionType: "skill",
  workspaceName: "react-router",
  packageFormat: "agent-skill",
  packageName: "react-router",
  owner: "remix-run",
  repo: "react-router",
  path: ".agents/skills/react-router",
  ref: "main",
  resolvedCommit: "commit",
  resolvedTree: "tree",
  contentIdentity: "content",
  treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
});

describe("lock entry source authority", () => {
  it.effect("blocks sync reconstruction after a same-name endpoint change", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const configured = {
        type: "github",
        name: "github",
        url: new URL("https://github.example.test"),
      } satisfies SourceHostConfig;

      const error = yield* skillLockEntryToRef("react-router", entry, {
        baseDir: "/workspace",
        path,
        scope: "project",
        getConfiguredSourceByName: (name) =>
          Effect.succeed(name === configured.name ? Option.some(configured) : Option.none()),
      }).pipe(Effect.flip);

      expect(error.code).toBe("conflict");
      expect(error.detail).toContain("accepts endpoint https://github.com/");
      expect(error.detail).toContain("configuration resolves it to https://github.example.test/");
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
