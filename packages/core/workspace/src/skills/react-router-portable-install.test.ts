import * as fs from "node:fs";
import { UNCONSTRAINED_DESIRED_NODE } from "../desired-state/index.js";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { computeSourceHash } from "../desired-state/index.js";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import type { GitSource } from "@agentxm/extension-model/unstable/sources/types";
import { sourceToLockEntry } from "../desired-state/index.js";
import { extensionName } from "../materialization/test-helpers.js";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import { observeCanonicalExtension } from "../desired-state/index.js";
import { resolveProjectWorkspaceLayout } from "../desired-state/index.js";
import type { GitHostedSkillRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { materializeSkillCanonical } from "./materialization.js";

describe("portable React Router skill acquisition", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "react-router-skill-")));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("preserves the full portable tree under its source-qualified canonical path", () =>
    Effect.gen(function* () {
      const pathService = yield* Path.Path;
      const sourcePath = ".agents/skills/react-router";
      const sourceRoot = path.join(tempDir, "checkout", sourcePath);
      fs.mkdirSync(path.join(sourceRoot, "references"), { recursive: true });
      fs.writeFileSync(
        path.join(sourceRoot, "SKILL.md"),
        "---\nname: react-router\ndescription: React Router guidance\n---\n\n# React Router\n",
      );
      fs.writeFileSync(path.join(sourceRoot, "references", "framework.md"), "# Framework\n");

      const source = {
        type: "git",
        url: new URL("https://github.com/remix-run/react-router.git"),
        ref: Option.some("main"),
        subPath: Option.some(sourcePath),
      } satisfies GitSource;
      const ref = {
        type: "skill",
        refType: "git-hosted",
        source,
        name: extensionName("react-router"),
        sourcePath,
        portable: true,
        location: pathToFileURL(sourceRoot).href,
        gitTreeSha: "tree",
        gitCommitSha: "commit",
        skill: {
          name: extensionName("react-router"),
          description: Option.some("React Router guidance"),
          metadata: Option.none(),
        },
      } satisfies GitHostedSkillRef;
      const layout = yield* resolveProjectWorkspaceLayout(makeAbsolutePath(pathService, tempDir), {
        agents: [],
      });
      const materialized = yield* materializeSkillCanonical({
        ref,
        sanitizedName: "react-router",
        baseDir: tempDir,
        layout,
      });
      const canonical = path.join(
        tempDir,
        "agent_extensions",
        "git",
        "@portable",
        "skills",
        "react-router",
      );

      expect(materialized.skillSrcPath).toBe(canonical);
      expect(fs.readFileSync(path.join(canonical, "SKILL.md"), "utf8")).toContain("# React Router");
      expect(fs.readFileSync(path.join(canonical, "references", "framework.md"), "utf8")).toBe(
        "# Framework\n",
      );
      expect(fs.existsSync(path.join(canonical, "skill.json"))).toBe(false);
      expect(printSourceParams(source)).toBe(
        "github:remix-run/react-router//.agents/skills/react-router@main",
      );

      if (materialized.treeIntegrity === undefined) {
        return yield* Effect.die("Expected acquired tree integrity");
      }
      const lockEntry = sourceToLockEntry({
        ref,
        contentIdentity: computeSourceHash("react-router-content"),
        treeIntegrity: materialized.treeIntegrity,
      });
      expect(lockEntry).toMatchObject({
        source: {
          type: "git",
          url: new URL("https://github.com/remix-run/react-router.git"),
          path: sourcePath,
          revision: "main",
        },
        identity: { name: "react-router" },
      });
      expect(lockEntry?.identity).not.toHaveProperty("owner");

      const observed = yield* observeCanonicalExtension({
        layout,
        desired: {
          type: "skill",
          name: "react-router",
          identity: printSourceParams(source),
          source: printSourceParams(source),
          enabled: true,
          constraint: UNCONSTRAINED_DESIRED_NODE,
          origins: [{ type: "settings", source: printSourceParams(source), enabled: true }],
        },
        accepted: lockEntry,
      });
      expect(observed.status).toBe("usable");
      expect(observed.path).toBe(canonical);
    }).pipe(Effect.provide(Layer.merge(NodeServices.layer, FetchHttpClient.layer))),
  );
});
