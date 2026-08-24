import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import {
  WorkspaceMutations,
  isWorkspaceTransitionHeldByThisInvocation,
} from "@agentxm/client-core/unstable/workspace";

import { makeBaseWorkspaceMock } from "../../test-stubs.js";
import { withOperationLifecycle } from "./operation-lifecycle.js";

let tempDir: string;

beforeEach(() => {
  tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-operation-lifecycle-"));
});

afterEach(() => {
  nodeFs.rmSync(tempDir, { recursive: true, force: true });
});

describe("withOperationLifecycle", () => {
  // Expected-failure pin: the apply-mode boundary today acquires the
  // workspace transition before the body runs. The marker comes off when
  // acquisition moves to post-confirmation revalidation. Lock lifetime is a
  // design invariant, not a contract obligation, so this test carries no
  // obligation ID.
  it.effect.fails("does not hold the workspace transition before the body confirms", () =>
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
