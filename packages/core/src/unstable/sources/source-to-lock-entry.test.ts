import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { SourceHashSchema } from "../extensions/rendered-files.js";
import type {
  GitHostedSkillRef,
  LocalSkillRef,
  RegistrySkillRef,
  WorkspaceSkillRef,
} from "../skills/refs.js";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import { sourceToLockEntry } from "./source-to-lock-entry.js";

const contentIdentity = Schema.decodeUnknownSync(SourceHashSchema)("sha256-content");
const skill = {
  name: extensionName("review"),
  description: Option.none<string>(),
  metadata: Option.none<Readonly<Record<string, unknown>>>(),
};

describe("sourceToLockEntry", () => {
  it("persists immutable Git identity", () => {
    const ref: GitHostedSkillRef = {
      type: "skill",
      refType: "git-hosted",
      skill,
      source: {
        type: "github",
        url: new URL("https://github.com"),
        owner: "acme",
        repo: "extensions",
        ref: Option.some("main"),
        subPath: Option.some("skills/review"),
      },
      location: "file:///tmp/clone",
      sourcePath: "skills/review",
      gitCommitSha: "commit-123",
      gitTreeSha: "tree-456",
    };

    expect(sourceToLockEntry({ ref, sourceName: Option.none(), contentIdentity })).toEqual({
      type: "github",
      owner: "acme",
      repo: "extensions",
      ref: "main",
      path: "skills/review",
      resolvedCommit: "commit-123",
      resolvedTree: "tree-456",
      contentIdentity,
    });
  });

  it("persists a workspace-relative local path and content identity", () => {
    const ref: LocalSkillRef = {
      type: "skill",
      refType: "local",
      skill,
      source: { type: "local", path: "/tmp/review" },
      location: "file:///tmp/review",
    };

    expect(
      sourceToLockEntry({
        ref,
        sourceName: Option.none(),
        contentIdentity,
        workspaceRelativeLocalSourcePath: Option.some("../sources/review"),
      }),
    ).toEqual({ type: "local", path: "../sources/review", contentIdentity });
  });

  it("persists Registry provenance without receipt fields", () => {
    const ref: RegistrySkillRef = {
      type: "skill",
      refType: "registry",
      skill,
      source: {
        type: "registry",
        location: new URL("https://registry.example"),
        owner: Option.some(handle("@acme")),
      },
      owner: handle("@acme"),
      publisherBindingId: "binding-1",
      name: extensionName("review"),
      version: exactVersion("1.2.3"),
      integrity: Option.some("sha512-archive"),
      packages: [],
    };

    expect(
      sourceToLockEntry({
        ref,
        sourceName: Option.some("enterprise"),
        contentIdentity,
      }),
    ).toEqual({
      type: "registry",
      owner: handle("@acme"),
      name: extensionName("review"),
      resolvedVersion: exactVersion("1.2.3"),
      integrity: "sha512-archive",
      sourceName: "enterprise",
      publisherBindingId: "binding-1",
    });
  });

  it("does not create lock authority for authored workspace content", () => {
    const ref: WorkspaceSkillRef = {
      type: "skill",
      refType: "workspace",
      skill,
      source: {
        type: "workspace",
        owner: handle("@acme"),
        extensionType: "skill",
        name: extensionName("review"),
      },
      owner: handle("@acme"),
      name: extensionName("review"),
      version: exactVersion("1.0.0"),
      scope: "project",
      location: "file:///workspace/.axm/extensions/@acme/skills/review",
      sourceHash: contentIdentity,
    };

    expect(sourceToLockEntry({ ref, sourceName: Option.none(), contentIdentity })).toBeUndefined();
  });
});
