import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { computeSourceHash } from "../extensions/index.js";
import type { SourceHostProvidersService } from "../source-resolution/index.js";
import { printSourceParams, sourceToLockEntry, type GitHubSource } from "../sources/index.js";
import { extensionName } from "../test-helpers.js";
import { makeAbsolutePath } from "../utils/path-types.js";
import { resolveProjectWorkspaceLayout } from "../workspace/layout.js";
import type { GitHostedSkillRef } from "./refs.js";
import {
  materializeSkillCanonical,
  type ProvideFs,
  type ProvideRegistryMaterialization,
} from "./materialization.js";

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
      const fsService = yield* FileSystem.FileSystem;
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
      const platformLayer = Layer.merge(
        Layer.succeed(FileSystem.FileSystem, fsService),
        Layer.succeed(Path.Path, pathService),
      );
      const provide: ProvideFs = (effect) => Effect.provide(effect, platformLayer);
      const provideRegistry: ProvideRegistryMaterialization = () =>
        Effect.die("Registry materialization is not used by this test");
      const sources: SourceHostProvidersService = {
        resolveNamedRegistry: () => Effect.die("not used"),
        find: () => Effect.succeed([]),
        fetch: () => Effect.die("not used"),
        cloneUrl: () => Option.none(),
        origin: () => "github",
      };

      const materialized = yield* materializeSkillCanonical({
        ref,
        sanitizedName: "react-router",
        fs: fsService,
        pathService,
        baseDir: tempDir,
        layout,
        sources,
        provide,
        provideRegistry,
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
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
