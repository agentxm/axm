import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { SkillLockEntry } from "../lockfile/schema.js";
import type { GitHostedSkillRef } from "../skills/refs.js";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import { prepareAcceptedCanonicalTransition } from "./accepted-canonical-ref.js";
import { makeBaseWorkspaceMock, TEST_TREE_INTEGRITY } from "./test-stubs.js";

describe("accepted canonical source transitions", () => {
  it.effect("removes only the superseded accepted package", () =>
    Effect.gen(function* () {
      const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-source-transition-"));
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => nodeFs.rmSync(root, { recursive: true, force: true })),
      );

      const previousPath = nodePath.join(
        root,
        "agent_extensions",
        "agentxm",
        "@acme",
        "skills",
        "review",
      );
      const unrelatedPath = nodePath.join(
        root,
        "agent_extensions",
        "github",
        "other",
        "extensions",
        "skills",
        "review",
      );
      nodeFs.mkdirSync(previousPath, { recursive: true });
      nodeFs.mkdirSync(unrelatedPath, { recursive: true });

      const accepted = {
        type: "registry",
        sourceType: "registry",
        sourceName: "agentxm",
        endpoint: new URL("https://registry.agentxm.ai"),
        extensionType: "skill",
        workspaceName: extensionName("review"),
        packageFormat: "agentxm",
        owner: handle("@acme"),
        name: extensionName("review"),
        resolvedVersion: exactVersion("1.0.0"),
        integrity: "sha512-review",
        publisherBindingId: "hbnd_review",
        treeIntegrity: TEST_TREE_INTEGRITY,
      } satisfies SkillLockEntry;
      const workspace = makeBaseWorkspaceMock(nodePath.join(root, ".axm"), {
        getLockedSkill: () => Effect.succeed(Option.some(accepted)),
      });
      const sourcePath = "skills/review";
      const sourceRoot = nodePath.join(root, "checkout", sourcePath);
      const ref = {
        type: "skill",
        refType: "git-hosted",
        source: {
          type: "github",
          name: "github",
          url: new URL("https://github.com"),
          owner: "acme",
          repo: "extensions",
          ref: Option.some("main"),
          subPath: Option.some(sourcePath),
        },
        name: extensionName("review"),
        sourcePath,
        portable: true,
        location: pathToFileURL(sourceRoot).href,
        gitTreeSha: "tree-2",
        gitCommitSha: "commit-2",
        skill: {
          name: extensionName("review"),
          description: Option.none(),
          metadata: Option.none(),
        },
      } satisfies GitHostedSkillRef;

      const cleanup = yield* prepareAcceptedCanonicalTransition({
        workspace,
        type: "skill",
        name: "review",
        ref,
      });
      expect(nodeFs.existsSync(previousPath)).toBe(true);

      yield* cleanup;

      expect(nodeFs.existsSync(previousPath)).toBe(false);
      expect(nodeFs.existsSync(unrelatedPath)).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
