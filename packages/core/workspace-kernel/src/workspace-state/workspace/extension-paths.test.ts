import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Result from "effect/Result";
import * as Option from "effect/Option";
import { handle } from "../testing.js";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import type { ProjectWorkspaceLayout } from "./layout.js";
import { acquiredPackageRelativePath, computeExtensionPathsForLayout } from "./extension-paths.js";

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
      canonicalPath: "/workspace/agent_extensions/registry.agentxm.ai/@acme/rules/review-pr",
      extensionSrcPath: "/workspace/agent_extensions/registry.agentxm.ai/@acme/rules/review-pr/src",
    });
  });

  it("computes external extension canonical and source paths", () => {
    const paths = computeExtensionPathsForLayout(
      nodePath.join,
      layout,
      {
        refType: "local",
        owner: handle("@acme"),
        source: { type: "local", path: "/workspace/vendor/reviewer" },
        sourcePath: "vendor/reviewer",
      },
      "subagents",
      "reviewer",
    );

    expect(paths).toEqual({
      canonicalPath: "/workspace/agent_extensions/_local/project/vendor/reviewer",
      extensionSrcPath: "/workspace/agent_extensions/_local/project/vendor/reviewer/src",
    });
  });

  it("distinguishes an external absolute source from project-relative content", () => {
    const paths = computeExtensionPathsForLayout(
      nodePath.join,
      layout,
      {
        refType: "local",
        owner: handle("@acme"),
        source: { type: "local", path: "/outside/review" },
        sourcePath: "/outside/review",
      },
      "skills",
      "review",
    );

    expect(paths).toEqual({
      canonicalPath: "/workspace/agent_extensions/_local/absolute/root/outside/review",
      extensionSrcPath: "/workspace/agent_extensions/_local/absolute/root/outside/review/src",
    });
  });

  it("computes a portable GitHub Agent Skill path from its exact selected source", () => {
    const paths = computeExtensionPathsForLayout(
      nodePath.join,
      layout,
      {
        refType: "git-hosted",
        source: {
          type: "git",
          url: new URL("https://github.com/remix-run/react-router.git"),
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
        "/workspace/agent_extensions/github.com/remix-run/react-router/.agents/skills/react-router",
      extensionSrcPath:
        "/workspace/agent_extensions/github.com/remix-run/react-router/.agents/skills/react-router",
    });
  });

  it("gives co-located native manifests the same physical package root", () => {
    const source = {
      refType: "git-hosted" as const,
      owner: handle("@acme"),
      source: {
        type: "git" as const,
        url: new URL("https://github.com/acme/extensions.git"),
        ref: Option.some("main"),
        subPath: Option.some("packages/shared"),
      },
      sourcePath: "packages/shared",
    };

    const skill = computeExtensionPathsForLayout(nodePath.join, layout, source, "skills", "review");
    const rule = computeExtensionPathsForLayout(
      nodePath.join,
      layout,
      source,
      "rules",
      "review-policy",
    );

    expect(skill.canonicalPath).toBe(
      "/workspace/agent_extensions/github.com/acme/extensions/packages/shared",
    );
    expect(rule.canonicalPath).toBe(
      "/workspace/agent_extensions/github.com/acme/extensions/packages/shared",
    );
  });
});

describe("acquired source coordinates", () => {
  it.each([
    ["https://github.com/acme/extensions.git", "github.com/acme/extensions"],
    ["https://github.acme.example/acme/extensions.git", "github.acme.example/acme/extensions"],
    [
      "https://github.partner.example/acme/extensions.git",
      "github.partner.example/acme/extensions",
    ],
    [
      "ssh://git@gitlab.example:2222/engineering/platform/extensions.git",
      "gitlab.example~3a2222/engineering/platform/extensions",
    ],
    ["https://bitbucket.org/acme/extensions.git", "bitbucket.org/acme/extensions"],
    [
      "https://dev.azure.com/acme/platform/_git/extensions",
      "dev.azure.com/acme/platform/_git/extensions",
    ],
  ])("places %s under its complete repository address", (url, expected) => {
    expect(
      Result.getOrThrow(
        acquiredPackageRelativePath(
          {
            refType: "git-hosted",
            owner: handle("@someone-else"),
            source: {
              type: "git",
              url: new URL(url),
              ref: Option.some("main"),
              subPath: Option.none(),
            },
            sourcePath: "skills/review",
          },
          "skills",
          "review",
        ),
      ),
    ).toBe(`${expected}/skills/review`);
  });

  it("shares plugin roots while preserving component locations", () => {
    const source = {
      type: "git" as const,
      url: new URL("https://github.com/basecamp/skills.git"),
      ref: Option.none(),
      subPath: Option.none(),
    };
    const paths = ["basecamp", "basecamp-doctor"].map((name) =>
      Result.getOrThrow(
        acquiredPackageRelativePath(
          {
            refType: "git-hosted",
            source,
            sourcePath: `skills/${name}`,
            portable: true,
            distribution: { format: "claude", packageRoot: ".", componentPath: `skills/${name}` },
          },
          "skills",
          name,
        ),
      ),
    );
    expect(paths).toEqual(["github.com/basecamp/skills", "github.com/basecamp/skills"]);
  });

  it("uses Registry endpoints independently of aliases", () => {
    const locate = (endpoint: string, alias: string) =>
      Result.getOrThrow(
        acquiredPackageRelativePath(
          {
            refType: "registry",
            owner: handle("@acme"),
            source: {
              type: "registry",
              name: alias,
              location: new URL(endpoint),
              owner: Option.none(),
            },
          },
          "skills",
          "review",
        ),
      );
    expect(locate("https://registry.example/team-a", "first")).toBe(
      locate("https://registry.example/team-a", "renamed"),
    );
    expect(locate("https://registry.example/team-a", "first")).toBe(
      "registry.example/team-a/@acme/skills/review",
    );
    expect(locate("https://registry.example/team-b", "first")).toBe(
      "registry.example/team-b/@acme/skills/review",
    );
    expect(locate("file:///srv/registry", "local")).toBe(
      "_local/absolute/root/srv/registry/@acme/skills/review",
    );
  });

  it.each([
    [
      "https://downloads.example/team/SKILL.md",
      "skill-md" as const,
      ".",
      undefined,
      "downloads.example/team",
    ],
    [
      "https://downloads.example/download",
      "skill-md" as const,
      ".",
      undefined,
      "downloads.example/download",
    ],
    [
      "https://downloads.example/extensions.zip",
      "archive" as const,
      "plugins/review",
      undefined,
      "downloads.example/extensions.zip/plugins/review",
    ],
    [
      "https://downloads.example/index.json",
      "index" as const,
      ".",
      "review",
      "downloads.example/index.json/review",
    ],
  ])("places logical HTTP resource %s", (url, kind, sourcePath, entry, expected) => {
    expect(
      Result.getOrThrow(
        acquiredPackageRelativePath(
          {
            refType: "http",
            source: {
              type: "http",
              url: new URL(url),
              kind,
              ...(entry === undefined ? {} : { entry }),
            },
            sourcePath,
            portable: true,
          },
          "skills",
          "review",
        ),
      ),
    ).toBe(expected);
  });
});
