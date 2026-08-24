import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { deriveOperationOutcome, operationExitCode } from "@agentxm/client-core/unstable/plan";
import {
  WorkspaceMutations,
  isWorkspaceTransitionHeldByThisInvocation,
} from "@agentxm/client-core/unstable/workspace";
import * as Option from "effect/Option";

import { makeBaseWorkspaceMock } from "../../test-stubs.js";
import { interruptionResolution, withOperationLifecycle } from "./operation-lifecycle.js";

let tempDir: string;

beforeEach(() => {
  tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-operation-lifecycle-"));
});

afterEach(() => {
  nodeFs.rmSync(tempDir, { recursive: true, force: true });
});

describe("withOperationLifecycle", () => {
  // A resolution produced before the journal exists reports what was
  // requested, never a hardcoded apply/candidate-atomic claim: an interrupted
  // preview stays a preview, and a non-rollbackable family keeps its
  // declared atomicity.
  it("C-15: pre-journal interruption reports the requested mode truthfully", () => {
    const preview = interruptionResolution(
      { command: "update", mode: "preview", planName: "Update extensions" },
      Option.none(),
      "SIGINT",
      [],
    );
    expect(preview.mode).toBe("preview");
    expect(preview.atomicity).toEqual({
      declared: "candidate-atomic",
      applied: "candidate-atomic",
    });
    expect(preview.interruption).toEqual({ signal: "SIGINT", disposition: "none" });
    expect(preview.units).toEqual([]);
    expect(deriveOperationOutcome(preview)).toBe("interrupted");
    expect(operationExitCode(preview)).toBe(130);

    const apply = interruptionResolution(
      { command: "update", mode: "apply", planName: "Update extensions" },
      Option.none(),
      "SIGTERM",
      [],
    );
    expect(apply.mode).toBe("apply");
    expect(deriveOperationOutcome(apply)).toBe("interrupted");
    expect(operationExitCode(apply)).toBe(143);
  });

  it("C-15: pre-journal interruption keeps the declared non-rollbackable atomicity", () => {
    const resolution = interruptionResolution(
      {
        command: "update",
        mode: "apply",
        planName: "Update workspace extensions",
        declaredAtomicity: "non-rollbackable",
      },
      Option.none(),
      "SIGINT",
      [],
    );
    // Nothing was attempted, so no durable effect was made or retained: the
    // declared class is the family's, the applied class reflects zero effects.
    expect(resolution.atomicity).toEqual({
      declared: "non-rollbackable",
      applied: "candidate-atomic",
    });
    expect(resolution.interruption?.disposition).toBe("none");
    expect(operationExitCode(resolution)).toBe(130);
  });

  // Lock lifetime is a design invariant, not a contract obligation, so this
  // test carries no obligation ID.
  it.effect("does not hold the workspace transition before the body confirms", () =>
    Effect.gen(function* () {
      const workspaceDir = nodePath.join(tempDir, ".axm");
      const resolved = nodePath.resolve(workspaceDir);
      const renderer = TestRenderer.make();
      // Planning, registry acquisition, preview, and the confirmation
      // decision all run inside the body; holding the workspace transition
      // across them lets a slow download or an open prompt monopolize the
      // workspace. The transition is acquired only after confirmation, for
      // revalidation through apply.
      let heldAtBodyStart: boolean | undefined;
      yield* withOperationLifecycle(
        { command: "update", mode: "apply", planName: "Update extensions" },
        Effect.sync(() => {
          heldAtBodyStart = isWorkspaceTransitionHeldByThisInvocation(resolved);
        }),
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            NodeServices.layer,
            renderer.layer,
            TestFlagsLayer({ nonInteractive: true }),
            WorkspaceMutations.layer(makeBaseWorkspaceMock(workspaceDir)),
          ),
        ),
      );
      expect(heldAtBodyStart).toBe(false);
    }),
  );
});
