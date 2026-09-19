import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { TreeIntegritySchema } from "./materialized-tree.js";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import type {
  GitHostedSkillRef,
  LocalSkillRef,
  RegistrySkillRef,
  WorkspaceSkillRef,
} from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import { sourceToLockEntry } from "./source-to-lock-entry.js";

const contentIdentity = Schema.decodeUnknownSync(SourceHashSchema)("sha256-content");
const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v1:${"0".repeat(64)}`,
);
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
      owner: handle("@acme"),
      name: extensionName("review"),
      skill,
      source: {
        type: "github",
        name: "github",
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

    expect(sourceToLockEntry({ ref, contentIdentity, treeIntegrity })).toEqual({
      source: {
        type: "git",
        url: new URL("https://github.com/acme/extensions.git"),
        revision: "main",
        path: "skills/review",
      },
      identity: { owner: handle("@acme"), name: extensionName("review") },
      resolved: { commit: "commit-123", tree: "tree-456" },
      treeIntegrity,
    });
  });

  it("persists a workspace-relative local path and content identity", () => {
    const ref: LocalSkillRef = {
      type: "skill",
      refType: "local",
      owner: handle("@acme"),
      name: extensionName("review"),
      skill,
      source: { type: "local", path: "/tmp/review" },
      location: "file:///tmp/review",
    };

    expect(
      sourceToLockEntry({
        ref,
        contentIdentity,
        treeIntegrity,
        workspaceRelativeLocalSourcePath: Option.some("../sources/review"),
      }),
    ).toEqual({
      source: { type: "path", path: "../sources/review" },
      identity: { owner: handle("@acme"), name: extensionName("review") },
      resolved: { tree: contentIdentity },
      treeIntegrity,
    });
  });

  it("persists Registry provenance without receipt fields", () => {
    const ref: RegistrySkillRef = {
      type: "skill",
      refType: "registry",
      skill,
      source: {
        type: "registry",
        name: "enterprise",
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
        contentIdentity,
        treeIntegrity,
      }),
    ).toEqual({
      source: { type: "registry", url: new URL("https://registry.example") },
      identity: { owner: handle("@acme"), name: extensionName("review") },
      resolved: {
        version: exactVersion("1.2.3"),
        integrity: "sha512-archive",
        publisherBindingId: "binding-1",
      },
      treeIntegrity,
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
      location: "file:///workspace/skills/review",
      sourceHash: contentIdentity,
    };

    expect(sourceToLockEntry({ ref, contentIdentity, treeIntegrity })).toBeUndefined();
  });
});
