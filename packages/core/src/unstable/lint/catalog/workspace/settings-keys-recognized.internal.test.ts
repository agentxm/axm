import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { WorkspaceReadModelTest } from "../../../workspace/read-model/__fixtures__/test-layer.js";
import { makeWorkspaceReadModel } from "../../../workspace/read-model/service.js";
import { settingsKeysRecognizedRule } from "./settings-keys-recognized.js";

const testWorkspace = WorkspaceReadModelTest({
  workspaceRoot: "/workspace",
  userHome: "/home/test",
  project: {
    settings: { _tag: "valid", contents: { telemetry: false } },
    lockfile: { _tag: "absent" },
  },
});

describe("workspace/settings-keys-recognized", () => {
  it.effect("reports the removed telemetry setting as an unrecognized key", () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspaceReadModel("project");
      const findings = yield* settingsKeysRecognizedRule.check({
        subject: { root: "/workspace", scope: "project" },
        workspace,
        axmDirExists: Effect.succeed(true),
        displayRoot: "",
      });

      expect(findings).toEqual([
        {
          kind: "advisory",
          ruleId: "workspace/settings-keys-recognized",
          severity: "error",
          message:
            "Workspace settings has unrecognized top-level key 'telemetry'. The current settings schema does not recognize this key.",
          location: { file: "axm.json" },
        },
      ]);
    }).pipe(Effect.provide(testWorkspace)),
  );
});
