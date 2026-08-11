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
import { makeConfirmationRecovery, makePlanExecutionMode } from "./confirmation-recovery.js";

describe("confirmation recovery CLI boundary", () => {
  it.effect("preserves explicit global flags and user scope in a confirmable retry", () =>
    Effect.gen(function* () {
      const execution = yield* makePlanExecutionMode(
        { yes: false, preview: false },
        makeConfirmationRecovery(
          ["skills", "enable"],
          [recoveryPositional(publicRecoveryValue("code review"))],
        ),
      );

      expect(execution._tag).toBe("ConfirmableApply");
      if (execution._tag !== "ConfirmableApply") return;
      expect(renderConfirmationRecoveryCommand(execution.recovery)).toBe(
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

  it.effect("selects preview and preconfirmed modes without constructing a prompt", () =>
    Effect.gen(function* () {
      const recovery = makeConfirmationRecovery(["install"], []);
      expect((yield* makePlanExecutionMode({ yes: false, preview: true }, recovery))._tag).toBe(
        "Preview",
      );
      expect((yield* makePlanExecutionMode({ yes: true, preview: false }, recovery))._tag).toBe(
        "PreconfirmedApply",
      );
    }),
  );
});
