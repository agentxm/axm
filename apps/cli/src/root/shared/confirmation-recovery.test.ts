import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { TestFlagsLayer } from "../../cli-flags/index.js";
import {
  publicRecoveryValue,
  recoveryPositional,
  renderConfirmationRecoveryCommand,
} from "@agentxm/workspace-operations";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { makeBaseWorkspaceMock } from "../../test-stubs.js";
import {
  makeConfirmationRecovery,
  makePlanExecution,
  makeUninstallPlanExecution,
} from "./confirmation-recovery.js";

describe("confirmation recovery CLI boundary", () => {
  it.effect("preserves explicit global flags and user scope in a confirmable retry", () =>
    Effect.gen(function* () {
      const execution = yield* makePlanExecution(
        { yes: false, preview: false },
        makeConfirmationRecovery(
          ["demote"],
          [recoveryPositional(publicRecoveryValue("code review"))],
        ),
      );

      expect(execution.request).toMatchObject({
        mode: "apply",
        confirmableRiskApproval: "prompt-if-interactive",
      });
      if (!("approvalRecovery" in execution)) return;
      expect(
        renderConfirmationRecoveryCommand(execution.approvalRecovery, {
          approval: "preapprovable",
        }),
      ).toBe("axm demote --scope user --json --non-interactive --verbose --yes 'code review'");
      expect(
        renderConfirmationRecoveryCommand(execution.approvalRecovery, { approval: "interactive" }),
      ).toBe("axm demote --scope user --verbose 'code review'");
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          TestFlagsLayer({ json: true, nonInteractive: true, verbose: true }),
          WorkspaceMutations.layer(
            makeBaseWorkspaceMock("/tmp/axm-confirmation-recovery/.axm", { scope: "user" }),
          ),
        ),
      ),
    ),
  );

  it.effect("maps the parsed intent to the shared execution request", () =>
    Effect.gen(function* () {
      const recovery = makeConfirmationRecovery(["install"], []);
      expect((yield* makePlanExecution({ yes: false, preview: true }, recovery)).request).toEqual({
        mode: "preview",
      });
      expect((yield* makePlanExecution({ preview: true }, recovery)).request).toEqual({
        mode: "preview",
      });
      expect(
        (yield* makePlanExecution({ yes: true, preview: false }, recovery)).request,
      ).toMatchObject({
        mode: "apply",
        confirmableRiskApproval: "preapproved",
      });
      // A route without a preapproval capability never expresses one: its
      // apply can only be approved at a prompt.
      expect((yield* makePlanExecution({ preview: false }, recovery)).request).toMatchObject({
        mode: "apply",
        confirmableRiskApproval: "interactive-only",
      });
    }),
  );

  it.effect("classifies an uninstall target as planned absent", () =>
    Effect.gen(function* () {
      const execution = yield* makeUninstallPlanExecution(
        { preview: false },
        ["skills", "uninstall"],
        ["review"],
      );

      expect(execution.configuredAgentOperations).toEqual([
        { extensionType: "skill", name: "review", plannedState: "absent" },
      ]);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          TestFlagsLayer({}),
          WorkspaceMutations.layer(makeBaseWorkspaceMock("/tmp/axm-confirmation-recovery/.axm")),
        ),
      ),
    ),
  );
});
