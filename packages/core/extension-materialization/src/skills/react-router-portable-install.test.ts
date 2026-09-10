import * as fs from "node:fs";
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
import { computeSourceHash } from "@agentxm/workspace-state";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import type { GitHubSource } from "@agentxm/extension-model/unstable/sources/types";
import { sourceToLockEntry } from "@agentxm/workspace-state";
import { extensionName } from "../test-helpers.js";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import { observeCanonicalExtension } from "@agentxm/workspace-state";
import { resolveProjectWorkspaceLayout } from "@agentxm/workspace-state";
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
        type: "github",
        name: "github",
        url: new URL("https://github.com"),
        owner: "remix-run",
        repo: "react-router",
        ref: Option.some("main"),
        subPath: Option.some(sourcePath),
      } satisfies GitHubSource;
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
        "github",
        "remix-run",
        "react-router",
        ".agents",
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
        sourceName: Option.none(),
        contentIdentity: computeSourceHash("react-router-content"),
        treeIntegrity: materialized.treeIntegrity,
      });
      expect(lockEntry).toMatchObject({
        type: "github",
        sourceType: "github",
        sourceName: "github",
        endpoint: new URL("https://github.com"),
        extensionType: "skill",
        workspaceName: "react-router",
        packageFormat: "agent-skill",
        owner: "remix-run",
        repo: "react-router",
        path: sourcePath,
        ref: "main",
      });
      expect(lockEntry).not.toHaveProperty("packageOwner");

      const observed = yield* observeCanonicalExtension({
        layout,
        desired: {
          type: "skill",
          name: "react-router",
          identity: printSourceParams(source),
          source: printSourceParams(source),
          enabled: true,
          constraints: [],
          origins: [{ type: "settings", source: printSourceParams(source), enabled: true }],
        },
        accepted: lockEntry,
      });
      expect(observed.status).toBe("usable");
      expect(observed.path).toBe(canonical);
    }).pipe(Effect.provide(Layer.merge(NodeServices.layer, FetchHttpClient.layer))),
  );
});
