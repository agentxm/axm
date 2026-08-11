import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import {
  publicRecoveryValue,
  recoveryPositional,
  renderConfirmationRecoveryCommand,
} from "@agentxm/client-core/unstable/cli-runtime";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { makeBaseWorkspaceMock } from "../../test-stubs.js";
import { makeConfirmationRecovery, makePlanExecution } from "./confirmation-recovery.js";

describe("confirmation recovery CLI boundary", () => {
  it.effect("preserves explicit global flags and user scope in a confirmable retry", () =>
    Effect.gen(function* () {
      const execution = yield* makePlanExecution(
        { yes: false, preview: false },
        makeConfirmationRecovery(
          ["skills", "enable"],
          [recoveryPositional(publicRecoveryValue("code review"))],
        ),
      );

      expect(execution.request).toMatchObject({
        mode: "apply",
        confirmableRiskApproval: "prompt-if-interactive",
      });
      if (!("approvalRecovery" in execution)) return;
      expect(renderConfirmationRecoveryCommand(execution.approvalRecovery)).toBe(
        "axm skills enable --scope user --json --non-interactive --verbose --yes 'code review'",
      );
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

  it.effect("maps preview and --yes to the shared execution request", () =>
    Effect.gen(function* () {
      const recovery = makeConfirmationRecovery(["install"], []);
      expect((yield* makePlanExecution({ yes: false, preview: true }, recovery)).request).toEqual({
        mode: "preview",
      });
      expect(
        (yield* makePlanExecution({ yes: true, preview: false }, recovery)).request,
      ).toMatchObject({
        mode: "apply",
        confirmableRiskApproval: "preapproved",
      });
    }),
  );
});
