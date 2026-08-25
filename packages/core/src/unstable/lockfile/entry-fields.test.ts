import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { decodeExtensionNameSync } from "../extensions/common.js";
import { decodeHandleSync } from "../extensions/handle.js";
import { TreeIntegritySchema } from "../extensions/materialized-tree.js";
import { SourceHashSchema } from "../extensions/rendered-files.js";
import { gitSourceLockFields } from "./entry-fields.js";

describe("gitSourceLockFields", () => {
  it("persists locator plus immutable commit, tree, and content identities", () => {
    const contentIdentity = Schema.decodeUnknownSync(SourceHashSchema)("sha256-content");
    const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
      `sha256-tree-v1:${"0".repeat(64)}`,
    );
    expect(
      gitSourceLockFields(
        {
          type: "github",
          name: "github",
          url: new URL("https://github.com"),
          owner: "acme",
          repo: "extensions",
          ref: Option.some("main"),
          subPath: Option.some("skills/review"),
        },
        "skill",
        decodeExtensionNameSync("review"),
        Option.some("skills/review"),
        "commit-1",
        "tree-1",
        contentIdentity,
        decodeHandleSync("@acme"),
        decodeExtensionNameSync("review"),
        treeIntegrity,
      ),
    ).toEqual({
      type: "github",
      sourceType: "github",
      sourceName: "github",
      endpoint: new URL("https://github.com"),
      extensionType: "skill",
      workspaceName: "review",
      packageFormat: "agentxm",
      packageOwner: "@acme",
      packageName: "review",
      owner: "acme",
      repo: "extensions",
      ref: "main",
      path: "skills/review",
      resolvedCommit: "commit-1",
      resolvedTree: "tree-1",
      contentIdentity,
      treeIntegrity,
    });
  });
});
