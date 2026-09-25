import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import type {
  GitHostedSkillRef,
  LocalSkillRef,
  RegistrySkillRef,
  WorkspaceSkillRef,
} from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { LocalSubagentRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import { TreeIntegritySchema } from "../desired-state/index.js";
import { exactVersion, extensionName, handle } from "./test-helpers.js";
import { acceptedResolutionFor } from "./accepted-resolution.js";

const sourceHash = Schema.decodeUnknownSync(SourceHashSchema)("sha256-content");
const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v1:${"0".repeat(64)}`,
);
const acquired = Option.some({
  sourceHash,
  treeIntegrity,
  workspaceRelativeLocalSourcePath: Option.none<string>(),
});
const skill = {
  name: extensionName("review"),
  description: Option.none<string>(),
  metadata: Option.none<Readonly<Record<string, unknown>>>(),
};

describe("acceptedResolutionFor", () => {
  it.effect("records immutable Git identity under the configured name", () =>
    Effect.gen(function* () {
      const ref: GitHostedSkillRef = {
        type: "skill",
        refType: "git-hosted",
        owner: handle("@acme"),
        name: extensionName("review"),
        skill,
        source: {
          type: "git",
          url: new URL("https://github.com/acme/extensions.git"),
          ref: Option.some("main"),
          subPath: Option.some("skills/review"),
        },
        location: "file:///tmp/clone",
        sourcePath: "skills/review",
        gitCommitSha: "commit-123",
        gitTreeSha: "tree-456",
      };

      expect(yield* acceptedResolutionFor({ ref, acquired })).toEqual(
        Option.some({
          key: "review",
          entry: {
            source: {
              type: "git",
              url: new URL("https://github.com/acme/extensions.git"),
              revision: "main",
              path: "skills/review",
            },
            identity: { owner: handle("@acme"), name: extensionName("review") },
            resolved: { commit: "commit-123", tree: "tree-456" },
            treeIntegrity,
          },
        }),
      );
    }),
  );

  it.effect("records a portable skill without an owner", () =>
    Effect.gen(function* () {
      const ref: GitHostedSkillRef = {
        type: "skill",
        refType: "git-hosted",
        name: extensionName("review"),
        skill,
        source: {
          type: "git",
          url: new URL("https://github.com/acme/extensions.git"),
          ref: Option.none(),
          subPath: Option.none(),
        },
        location: "file:///tmp/clone",
        gitCommitSha: "commit-123",
        gitTreeSha: "tree-456",
      };

      const resolution = yield* acceptedResolutionFor({ ref, acquired });
      expect(Option.getOrUndefined(resolution)?.entry.identity).toEqual({
        name: extensionName("review"),
      });
    }),
  );

  it.effect("records the workspace-relative local path and content identity", () =>
    Effect.gen(function* () {
      const ref: LocalSubagentRef = {
        type: "subagent",
        refType: "local",
        owner: handle("@acme"),
        name: extensionName("planner"),
        subagent: { name: extensionName("planner"), description: Option.none() },
        source: { type: "local", path: "/tmp/planner" },
        location: "file:///tmp/planner",
      };

      expect(
        yield* acceptedResolutionFor({
          ref,
          acquired: Option.some({
            sourceHash,
            treeIntegrity,
            workspaceRelativeLocalSourcePath: Option.some("../sources/planner"),
          }),
        }),
      ).toEqual(
        Option.some({
          key: "planner",
          entry: {
            source: { type: "path", path: "../sources/planner" },
            identity: { owner: handle("@acme"), name: extensionName("planner") },
            resolved: { tree: sourceHash },
            treeIntegrity,
          },
        }),
      );
    }),
  );

  it.effect("records Registry provenance without receipt fields", () =>
    Effect.gen(function* () {
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

      expect(yield* acceptedResolutionFor({ ref, acquired })).toEqual(
        Option.some({
          key: "review",
          entry: {
            source: { type: "registry", url: new URL("https://registry.example") },
            identity: { owner: handle("@acme"), name: extensionName("review") },
            resolved: {
              version: exactVersion("1.2.3"),
              integrity: "sha512-archive",
              publisherBindingId: "binding-1",
            },
            treeIntegrity,
          },
        }),
      );
    }),
  );

  it.effect("creates no lock authority for authored workspace content", () =>
    Effect.gen(function* () {
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
        sourceHash,
      };

      expect(yield* acceptedResolutionFor({ ref, acquired: Option.none() })).toEqual(Option.none());
    }),
  );

  it.effect("fails closed when acquisition left no content identity to record", () =>
    Effect.gen(function* () {
      const ref: LocalSkillRef = {
        type: "skill",
        refType: "local",
        owner: handle("@acme"),
        name: extensionName("review"),
        skill,
        source: { type: "local", path: "/tmp/review" },
        location: "file:///tmp/review",
      };

      const error = yield* acceptedResolutionFor({ ref, acquired: Option.none() }).pipe(
        Effect.flip,
      );
      expect(error).toMatchObject({ _tag: "InstallStateMissing", type: "skill", name: "review" });
    }),
  );
});
