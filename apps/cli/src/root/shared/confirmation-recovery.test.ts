import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { TestFlagsLayer } from "../../cli-flags/index.js";
import {
  publicRecoveryValue,
  recoveryPositional,
  renderConfirmationRecoveryCommand,
} from "@agentxm/workspace/transitions/planning";
import { WorkspaceLocation } from "@agentxm/workspace/desired-state";
import { makeWorkspaceLocationMock } from "../../test-support/test-stubs.js";
import { makeConfirmationRecovery, makePlanInvocation } from "./confirmation-recovery.js";

describe("confirmation recovery CLI boundary", () => {
  it.effect("preserves explicit global flags and user scope in a confirmable retry", () =>
    Effect.gen(function* () {
      const { execution, recovery } = yield* makePlanInvocation(
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
      // The recovery the kernel holds for approval and the one the adapter
      // keeps for its own lines are the same invocation.
      expect(execution.approvalRecovery).toEqual(recovery);
      expect(renderConfirmationRecoveryCommand(recovery, { approval: "preapprovable" })).toBe(
        "axm demote --scope user --json --non-interactive --verbose --yes 'code review'",
      );
      expect(renderConfirmationRecoveryCommand(recovery, { approval: "interactive" })).toBe(
        "axm demote --scope user --verbose 'code review'",
      );
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          TestFlagsLayer({ json: true, nonInteractive: true, verbose: true }),
          Layer.effect(
            WorkspaceLocation,
            makeWorkspaceLocationMock("/tmp/axm-confirmation-recovery/.axm", { scope: "user" }),
          ),
        ),
      ),
    ),
  );

  it.effect("maps the parsed intent to the shared execution request", () =>
    Effect.gen(function* () {
      const recovery = makeConfirmationRecovery(["install"], []);
      const request = (intent: Parameters<typeof makePlanInvocation>[0]) =>
        Effect.map(makePlanInvocation(intent, recovery), ({ execution }) => execution.request);
      expect(yield* request({ yes: false, preview: true })).toEqual({ mode: "preview" });
      expect(yield* request({ preview: true })).toEqual({ mode: "preview" });
      // Advance approval accompanying a preview is dropped, not carried: a
      // preview cannot spend what it never receives.
      expect(yield* request({ yes: true, preview: true })).toEqual({ mode: "preview" });
      expect(yield* request({ yes: true, preview: false })).toMatchObject({
        mode: "apply",
        confirmableRiskApproval: "preapproved",
      });
      // A route without a preapproval capability never expresses one: its
      // apply can only be approved at a prompt.
      expect(yield* request({ preview: false })).toMatchObject({
        mode: "apply",
        confirmableRiskApproval: "interactive-only",
      });
    }),
  );
});
