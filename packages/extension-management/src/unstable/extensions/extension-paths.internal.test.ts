import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import { handle } from "../test-helpers.js";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import type { ProjectWorkspaceLayout } from "../workspace/layout.js";
import {
  computeExtensionPathsForLayout,
  extensionContentFilename,
  extensionContentPath,
} from "./extension-paths.js";

describe("extension path helpers", () => {
  const workspaceRoot = decodeAbsolutePathSync("/workspace");
  const layout: ProjectWorkspaceLayout = {
    scope: "project",
    workspaceRoot,
    projectRoot: workspaceRoot,
    settingsPath: decodeAbsolutePathSync("/workspace/axm.json"),
    lockPath: decodeAbsolutePathSync("/workspace/axm-lock.yaml"),
    runtimeDir: decodeAbsolutePathSync("/workspace/.axm"),
    acquiredRoot: decodeAbsolutePathSync("/workspace/agent_extensions"),
    authoredRoot: (type) => decodeAbsolutePathSync(`/workspace/${type}s`),
  };

  it("computes registry extension canonical and source paths", () => {
    const paths = computeExtensionPathsForLayout(
      nodePath.join,
      layout,
      {
        refType: "registry",
        owner: handle("@acme"),
        source: {
          type: "registry",
          name: "agentxm",
          location: new URL("https://registry.agentxm.ai"),
          owner: Option.none(),
        },
      },
      "rules",
      "review-pr",
    );

    expect(paths).toEqual({
      canonicalPath: "/workspace/agent_extensions/agentxm/@acme/rules/review-pr",
      extensionSrcPath: "/workspace/agent_extensions/agentxm/@acme/rules/review-pr/src",
    });
  });

  it("computes external extension canonical and source paths", () => {
    const paths = computeExtensionPathsForLayout(
      nodePath.join,
      layout,
      {
        refType: "local",
        source: { type: "local", path: "/workspace/vendor/reviewer" },
        sourcePath: "vendor/reviewer",
      },
      "subagents",
      "reviewer",
    );

    expect(paths).toEqual({
      canonicalPath: "/workspace/agent_extensions/local/vendor/reviewer",
      extensionSrcPath: "/workspace/agent_extensions/local/vendor/reviewer/src",
    });
  });

  it("encodes parent segments in an outside-workspace local source coordinate", () => {
    const paths = computeExtensionPathsForLayout(
      nodePath.join,
      layout,
      {
        refType: "local",
        source: { type: "local", path: "/outside/review" },
        sourcePath: "../outside/review",
      },
      "skills",
      "review",
    );

    expect(paths).toEqual({
      canonicalPath: "/workspace/agent_extensions/local/%2E%2E/outside/review",
      extensionSrcPath: "/workspace/agent_extensions/local/%2E%2E/outside/review/src",
    });
  });

  it("computes a portable GitHub Agent Skill path from its exact selected source", () => {
    const paths = computeExtensionPathsForLayout(
      nodePath.join,
      layout,
      {
        refType: "git-hosted",
        source: {
          type: "github",
          name: "github",
          url: new URL("https://github.com"),
          owner: "remix-run",
          repo: "react-router",
          ref: Option.some("main"),
          subPath: Option.some(".agents/skills/react-router"),
        },
        sourcePath: ".agents/skills/react-router",
        portable: true,
      },
      "skills",
      "react-router",
    );

    expect(paths).toEqual({
      canonicalPath:
        "/workspace/agent_extensions/github/remix-run/react-router/.agents/skills/react-router",
      extensionSrcPath:
        "/workspace/agent_extensions/github/remix-run/react-router/.agents/skills/react-router",
    });
  });

  it("computes markdown content filenames and paths", () => {
    expect(extensionContentFilename("review-pr")).toBe("review-pr.md");
    expect(extensionContentPath(nodePath.join, "/workspace/rules/review-pr", "review-pr")).toBe(
      "/workspace/rules/review-pr/review-pr.md",
    );
  });
});
