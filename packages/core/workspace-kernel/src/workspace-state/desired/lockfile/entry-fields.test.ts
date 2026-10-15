import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { TreeIntegritySchema } from "../../workspace/materialized-tree.js";
import { gitSourceLockFields } from "./entry-fields.js";

describe("gitSourceLockFields", () => {
  it("persists a generic Git locator plus immutable commit and tree identities", () => {
    const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
      `sha256-tree-v2:${"0".repeat(64)}`,
    );
    expect(
      gitSourceLockFields(
        {
          type: "git",
          url: new URL("https://github.com/acme/extensions.git"),
          ref: Option.some("main"),
          subPath: Option.some("skills/review"),
        },
        Option.some("skills/review"),
        "705f74ba5bd5309ca9e6a3de50df9ea722fb280c",
        "ed6943172cbca1a76031511bef0b5d3c6ba9bdca",
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
      resolved: {
        commit: "705f74ba5bd5309ca9e6a3de50df9ea722fb280c",
        tree: "ed6943172cbca1a76031511bef0b5d3c6ba9bdca",
      },
      treeIntegrity,
    });
  });
  it.each(["", "."])("omits the repository root subpath %j", (selected) => {
    const fields = gitSourceLockFields(
      {
        type: "git",
        url: new URL("https://github.com/acme/extensions.git"),
        ref: Option.none(),
        subPath: Option.none(),
      },
      Option.some(selected),
      "705f74ba5bd5309ca9e6a3de50df9ea722fb280c",
      "ed6943172cbca1a76031511bef0b5d3c6ba9bdca",
      decodeHandleSync("@acme"),
      decodeExtensionNameSync("review"),
      Schema.decodeUnknownSync(TreeIntegritySchema)(`sha256-tree-v2:${"0".repeat(64)}`),
    );
    expect(fields.source).toEqual({
      type: "git",
      url: new URL("https://github.com/acme/extensions.git"),
    });
  });
});
