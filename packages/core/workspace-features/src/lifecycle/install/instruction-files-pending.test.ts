import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { InstallExtensions } from "./install-extensions.js";
import { writeLocalRulePackage, writeLocalSkillPackage } from "../../testing/local-packages.js";
import { installRequest, makeInstallWorld } from "../../testing/install-world.js";

describe("Instruction files an install waits on", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const apply = (
    settings: Readonly<Record<string, unknown>>,
    write: typeof writeLocalRulePackage,
    type: "rule" | "skill",
  ) => {
    const { workspace, cleanup } = makeInstallWorld({ settings });
    cleanups.push(cleanup);
    const source = write(workspace.root, { name: "review" });
    return workspace
      .provide(
        Effect.gen(function* () {
          const candidate = yield* InstallExtensions.prepare(
            installRequest({ type, subject: { kind: "source", source } }),
          );
          return yield* InstallExtensions.previewOrApply(candidate, preapprovedPlanExecution);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  };

  it.effect(
    "reports a Rule installed where no instruction choice was made",
    () =>
      Effect.map(apply({}, writeLocalRulePackage, "rule"), (result) =>
        expect(result.instructionFilesPending).toBe(true),
      ),
    30_000,
  );

  it.effect(
    "reports nothing once the workspace has settled its instruction choice",
    () =>
      Effect.map(apply({ instructionFiles: false }, writeLocalRulePackage, "rule"), (result) =>
        expect(result.instructionFilesPending).toBe(false),
      ),
    30_000,
  );

  it.effect(
    "reports nothing for extensions that do not reach agents through instruction files",
    () =>
      Effect.map(apply({}, writeLocalSkillPackage, "skill"), (result) =>
        expect(result.instructionFilesPending).toBe(false),
      ),
    30_000,
  );
});
