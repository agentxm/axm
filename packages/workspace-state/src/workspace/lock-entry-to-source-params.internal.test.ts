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
        type: "github",
        sourceType: "github",
        sourceName: "github",
        endpoint: new URL("https://github.com"),
        extensionType: "skill",
        workspaceName: extensionName("review"),
        packageFormat: "agentxm",
        packageOwner: handle("@acme"),
        packageName: extensionName("review"),
        owner: "acme",
        repo: "extensions",
        ref: "main",
        path: "skills/review",
        resolvedCommit: "commit-1",
        resolvedTree: "tree-1",
        contentIdentity,
        treeIntegrity,
      }),
    ).toEqual({
      type: "github",
      sourceName: "github",
      owner: "acme",
      repo: "extensions",
      ref: Option.some("main"),
      subPath: Option.some("skills/review"),
    });
    expect(
      lockEntryToSourceParams({
        type: "local",
        sourceType: "local",
        sourceName: "local",
        extensionType: "skill",
        workspaceName: extensionName("review"),
        packageFormat: "agentxm",
        packageOwner: handle("@acme"),
        packageName: extensionName("review"),
        path: "../review",
        contentIdentity,
        treeIntegrity,
      }),
    ).toEqual({ type: "local", path: "../review" });
  });

  it("prints a Registry accepted resolution as an exact locator", () => {
    expect(
      printSkillLockSourceLocator("ignored", {
        type: "registry",
        sourceType: "registry",
        endpoint: new URL("https://registry.agentxm.ai"),
        extensionType: "skill",
        workspaceName: extensionName("review"),
        packageFormat: "agentxm",
        owner: handle("@acme"),
        name: extensionName("review"),
        resolvedVersion: exactVersion("1.2.3"),
        integrity: "sha512-archive",
        sourceName: "agentxm",
        publisherBindingId: "binding-1",
        treeIntegrity,
      }),
    ).toBe("agentxm:@acme/skills/review@1.2.3");
  });
});
