import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { WorkspaceReadModelTest } from "../../../workspace/read-model/__fixtures__/test-layer.js";
import { SettingsIoError } from "../../../workspace/read-model/errors.js";
import { makeWorkspaceReadModel } from "../../../workspace/read-model/service.js";
import {
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  evaluateAxmSkillCompatibility,
} from "../../../skills/axm-skill-compatibility.js";
import { axmSkillCompatibleRule } from "./axm-skill-compatible.js";

const testWorkspace = WorkspaceReadModelTest({
  workspaceRoot: "/workspace",
  userHome: "/home/test",
  project: { settings: { _tag: "absent" }, lockfile: { _tag: "absent" } },
});

const incompatible = evaluateAxmSkillCompatibility({
  cliVersion: "1.2.3",
  skill: {
    manifestVersion: "1.1.0",
    source: "@agentxm/skills/axm@1.1.0",
    metadata: {
      [AXM_SKILL_CLI_VERSION_METADATA_KEY]: "1.1.0",
      [AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY]: ">=1.1.0 <1.2.0",
    },
  },
});

describe("workspace/axm-skill-compatible", () => {
  it("is a non-autofixing error rule with a stable public id", () => {
    expect(axmSkillCompatibleRule.id).toBe("workspace/axm-skill-compatible");
    expect(axmSkillCompatibleRule.kind).toBe("advisory");
    expect(axmSkillCompatibleRule.severity).toBe("error");
    expect(axmSkillCompatibleRule.description.length).toBeLessThanOrEqual(100);
  });

  it.effect("reports the evaluator detail and source-preserving recovery command", () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspaceReadModel("project");
      const findings = yield* axmSkillCompatibleRule.check({
        subject: { root: "/workspace", scope: "project" },
        workspace,
        axmDirExists: Effect.succeed(true),
        axmSkillCompatibility: Effect.succeed(incompatible),
        displayRoot: "",
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        ruleId: "workspace/axm-skill-compatible",
        severity: "error",
        kind: "advisory",
      });
      expect(findings[0]?.message).toContain(incompatible.detail);
      expect(findings[0]?.message).toContain("axm skills update --name axm --preview");
    }).pipe(Effect.provide(testWorkspace)),
  );

  it.effect("emits no finding for a compatible pair", () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspaceReadModel("project");
      const compatible = evaluateAxmSkillCompatibility({
        cliVersion: "1.1.3",
        skill: {
          manifestVersion: "1.1.0",
          source: "@agentxm/skills/axm@1.1.0",
          metadata: {
            [AXM_SKILL_CLI_VERSION_METADATA_KEY]: "1.1.0",
            [AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY]: ">=1.1.0 <1.2.0",
          },
        },
      });
      const findings = yield* axmSkillCompatibleRule.check({
        subject: { root: "/workspace", scope: "project" },
        workspace,
        axmDirExists: Effect.succeed(true),
        axmSkillCompatibility: Effect.succeed(compatible),
        displayRoot: "",
      });
      expect(findings).toEqual([]);
    }).pipe(Effect.provide(testWorkspace)),
  );

  it.effect("reports an unreadable compatibility state as a lint finding", () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspaceReadModel("project");
      const findings = yield* axmSkillCompatibleRule.check({
        subject: { root: "/workspace", scope: "project" },
        workspace,
        axmDirExists: Effect.succeed(true),
        axmSkillCompatibility: Effect.fail(
          new SettingsIoError({ path: "/workspace/axm.json", cause: "denied" }),
        ),
        displayRoot: "",
      });

      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toContain("SettingsIoError");
      expect(findings[0]?.message).toContain("Repair the workspace state");
    }).pipe(Effect.provide(testWorkspace)),
  );
});
