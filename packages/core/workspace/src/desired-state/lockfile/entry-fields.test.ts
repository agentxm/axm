import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { TreeIntegritySchema } from "../workspace/materialized-tree.js";
import { gitSourceLockFields } from "./entry-fields.js";

describe("gitSourceLockFields", () => {
  it("persists a generic Git locator plus immutable commit and tree identities", () => {
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
        Option.some("skills/review"),
        "commit-1",
        "tree-1",
        decodeHandleSync("@acme"),
        decodeExtensionNameSync("review"),
        treeIntegrity,
      ),
    ).toEqual({
      source: {
        type: "git",
        url: new URL("https://github.com/acme/extensions.git"),
        revision: "main",
        path: "skills/review",
      },
      identity: { owner: "@acme", name: "review" },
      resolved: { commit: "commit-1", tree: "tree-1" },
      treeIntegrity,
    });
  });
});
