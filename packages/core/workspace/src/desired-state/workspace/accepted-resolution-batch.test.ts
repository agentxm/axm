import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import {
  HookLockEntrySchema,
  KnowledgeLockEntrySchema,
  McpServerLockEntrySchema,
  RuleLockEntrySchema,
  type Lockfile,
  type SkillLockEntry,
} from "../lockfile/schema.js";
import { TreeIntegritySchema } from "./materialized-tree.js";
import { makeAcceptedResolutionWriter } from "./accepted-resolution-writer.js";
import type { WorkspaceDocumentsService } from "./documents.js";

const contentIdentity = Schema.decodeUnknownSync(SourceHashSchema)("sha256-content");
const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v1:${"0".repeat(64)}`,
);

const acceptedSkill = (name: string): SkillLockEntry => ({
  source: { type: "path", path: `../sources/${name}` },
  identity: { owner: decodeHandleSync("@acme"), name: decodeExtensionNameSync(name) },
  resolved: { tree: contentIdentity },
  treeIntegrity,
});

describe("accepted-state closure batching", () => {
  const requirement =
    "When one closure retires multiple accepted resolutions, AXM shall commit the changed lock document once while retaining unrelated entries, and a semantic no-op shall not commit it.";

  it.effect(requirement, () =>
    Effect.gen(function* () {
      const initial: Lockfile = {
        lockfileVersion: 8,
        skills: {
          first: acceptedSkill("first"),
          second: acceptedSkill("second"),
          unrelated: acceptedSkill("unrelated"),
        },
        rules: { shared: Schema.decodeUnknownSync(RuleLockEntrySchema)(acceptedSkill("shared")) },
        hooks: { shared: Schema.decodeUnknownSync(HookLockEntrySchema)(acceptedSkill("shared")) },
        knowledge: {
          shared: Schema.decodeUnknownSync(KnowledgeLockEntrySchema)(acceptedSkill("shared")),
        },
        mcpServers: {
          shared: Schema.decodeUnknownSync(McpServerLockEntrySchema)(acceptedSkill("shared")),
        },
      };
      const state = yield* Ref.make(initial);
      const commits = yield* Ref.make(0);
      const documents: WorkspaceDocumentsService = {
        settings: () => Effect.die("settings are not used by accepted-state retirement"),
        acceptedResolutions: Ref.get(state),
        acceptedResolutionState: Effect.succeed("ok"),
        writeSettings: () => Effect.die("settings are not used by accepted-state retirement"),
        commitAcceptedResolutions: (_base, next) =>
          Ref.set(state, next).pipe(Effect.andThen(Ref.update(commits, (count) => count + 1))),
      };
      const writer = makeAcceptedResolutionWriter(documents, yield* Semaphore.make(1));

      yield* writer.removeAcceptedEntries([
        { type: "skill", key: "first" },
        { type: "rule", key: "shared" },
        { type: "skill", key: "second" },
        { type: "skill", key: "first" },
      ]);
      expect(Object.keys((yield* Ref.get(state)).skills)).toEqual(["unrelated"]);
      expect(Object.keys((yield* Ref.get(state)).rules ?? {})).toEqual([]);
      expect(Object.keys((yield* Ref.get(state)).hooks ?? {})).toEqual(["shared"]);
      expect(Object.keys((yield* Ref.get(state)).knowledge ?? {})).toEqual(["shared"]);
      expect(Object.keys((yield* Ref.get(state)).mcpServers ?? {})).toEqual(["shared"]);
      expect(yield* Ref.get(commits)).toBe(1);

      yield* writer.removeAcceptedEntries([{ type: "skill", key: "missing" }]);
      expect(yield* Ref.get(commits)).toBe(1);
    }),
  );
});
