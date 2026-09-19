import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { TreeIntegritySchema } from "./materialized-tree.js";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import {
  lockEntryToSourceParams,
  printSkillLockSourceLocator,
} from "./lock-entry-to-source-params.js";

const contentIdentity = Schema.decodeUnknownSync(SourceHashSchema)("sha256-content");
const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v1:${"0".repeat(64)}`,
);

describe("lock entry printers", () => {
  it("maps accepted Git and local resolutions back to source parameters", () => {
    expect(
      lockEntryToSourceParams({
        source: {
          type: "git",
          url: new URL("https://github.com/acme/extensions.git"),
          revision: "main",
          path: "skills/review",
        },
        identity: { owner: handle("@acme"), name: extensionName("review") },
        resolved: { commit: "commit-1", tree: "tree-1" },
        treeIntegrity,
      }),
    ).toEqual({
      type: "git",
      url: new URL("https://github.com/acme/extensions.git"),
      ref: Option.some("main"),
    });
    expect(
      lockEntryToSourceParams({
        source: { type: "path", path: "../review" },
        identity: { owner: handle("@acme"), name: extensionName("review") },
        resolved: { tree: contentIdentity },
        treeIntegrity,
      }),
    ).toEqual({ type: "local", path: "../review" });
  });

  it("prints a Registry accepted resolution as an exact locator", () => {
    expect(
      printSkillLockSourceLocator("ignored", {
        source: { type: "registry", url: new URL("https://registry.agentxm.ai") },
        identity: { owner: handle("@acme"), name: extensionName("review") },
        resolved: {
          version: exactVersion("1.2.3"),
          integrity: "sha512-archive",
          publisherBindingId: "binding-1",
        },
        treeIntegrity,
      }),
    ).toBe("registry:https://registry.agentxm.ai/:@acme/skills/review@1.2.3");
  });
});
