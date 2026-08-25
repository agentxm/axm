import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { WorkspaceReadModelTest } from "../workspace/read-model/__fixtures__/test-layer.js";
import { makeWorkspaceReadModel } from "../workspace/read-model/service.js";
import { decodeExtensionNameSync } from "../extensions/common.js";
import {
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  AxmSkillCompatibilityPolicy,
  makeAxmSkillCompatibilityPolicyLayer,
} from "./axm-skill-compatibility.js";
import { readAxmSkillWorkspaceCompatibility } from "./axm-skill-workspace-compatibility.js";

const VERSION = "1.2.0";
const RANGE = ">=1.2.0 <1.3.0";

const compatibleFixture = WorkspaceReadModelTest({
  workspaceRoot: "/workspace",
  userHome: "/home/test",
  project: {
    settings: {
      _tag: "valid",
      contents: {
        owner: "@team",
        agents: [],
        skills: {
          axm: { source: `@agentxm/skills/axm@${VERSION}`, enabled: true },
        },
      },
    },
    lockfile: { _tag: "absent" },
    axmExtensions: {
      "agentxm/@agentxm/skills/axm/skill.json": JSON.stringify({
        owner: "@agentxm",
        type: "skill",
        name: "axm",
        version: VERSION,
      }),
      "agentxm/@agentxm/skills/axm/src/SKILL.md": `---\nname: axm\ndescription: AXM workflow guidance\nmetadata:\n  ${AXM_SKILL_CLI_VERSION_METADATA_KEY}: ${VERSION}\n  ${AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY}: "${RANGE}"\n---\n`,
    },
  },
});
const testLayer = Layer.mergeAll(compatibleFixture, makeAxmSkillCompatibilityPolicyLayer("1.2.3"));

describe("readAxmSkillWorkspaceCompatibility", () => {
  it.effect("reads the canonical manifest and SKILL.md metadata once for evaluation", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const policy = yield* AxmSkillCompatibilityPolicy;
      const workspace = yield* makeWorkspaceReadModel("project");
      const result = yield* readAxmSkillWorkspaceCompatibility({
        platform: { fs, path },
        workspace,
        policy,
      });
      expect(result).toEqual({
        status: "compatible",
        cliVersion: "1.2.3",
        skillVersion: VERSION,
        source: `@agentxm/skills/axm@${VERSION}`,
        declaredCliVersion: VERSION,
        declaredCliVersionRange: RANGE,
        reasonCode: null,
        detail: null,
        recovery: {
          action: "none",
          targetCliVersion: "1.2.3",
          targetSkillVersion: VERSION,
          nextAction: null,
          steps: [],
        },
      });
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("reports a non-official axm declaration as the official skill missing", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const policy = yield* AxmSkillCompatibilityPolicy;
      const workspace = yield* makeWorkspaceReadModel("project");
      const installed = yield* workspace.skills.byName("axm");
      expect(Option.isSome(installed)).toBe(true);
      const result = yield* readAxmSkillWorkspaceCompatibility({
        platform: { fs, path },
        workspace: {
          scope: workspace.scope,
          skills: {
            ...workspace.skills,
            byName: () =>
              Effect.succeed(
                Option.map(installed, (row) => ({
                  ...row,
                  installationOrigin: {
                    _tag: "direct",
                    declared: {
                      name: decodeExtensionNameSync("axm"),
                      entry: { source: "github:someone/else", enabled: true },
                    },
                  },
                })),
              ),
          },
        },
        policy,
      });
      expect(result.reasonCode).toBe("axm-skill-missing");
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("preserves bundled source authority in the compatibility fact", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const policy = yield* AxmSkillCompatibilityPolicy;
      const workspace = yield* makeWorkspaceReadModel("project");
      const installed = yield* workspace.skills.byName("axm");
      const result = yield* readAxmSkillWorkspaceCompatibility({
        platform: { fs, path },
        workspace: {
          scope: workspace.scope,
          skills: {
            ...workspace.skills,
            byName: () =>
              Effect.succeed(
                Option.map(installed, (row) => ({
                  ...row,
                  installationOrigin: {
                    _tag: "direct",
                    declared: {
                      name: decodeExtensionNameSync("axm"),
                      entry: {
                        source: "workspace",
                        enabled: true,
                        origin: "bundled",
                      },
                    },
                  },
                })),
              ),
          },
        },
        policy,
      });

      expect(result.source).toBe(`bundled:@agentxm/skills/axm@${VERSION}`);
      expect(result.recovery.action).toBe("none");
    }).pipe(Effect.provide(testLayer)),
  );
});
