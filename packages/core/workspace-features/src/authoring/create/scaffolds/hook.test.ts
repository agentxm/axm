import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { TestHook } from "../../hooks/test-hook.js";
import {
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../../test-support/authoring-workspace.js";
import { hookScaffold } from "./hook.js";

describe("native hook starter execution", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const runtime of ["bash", "node", "python"] as const) {
    // Real child processes need live deadlines; these are fixture executions, not native host evidence.
    it.live(`runs applicable and nonapplicable ${runtime} fixtures`, () => {
      const workspace = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
      cleanups.push(workspace.cleanup);
      workspace.write("package.json", JSON.stringify({ type: "commonjs" }));
      return Effect.gen(function* () {
        yield* hookScaffold({
          name: "starter",
          owner: decodeHandleSync("@acme"),
          runtime,
          protocol: "claude-code",
          event: "SessionStart",
          matcher: Option.none(),
        }).populate(`${workspace.root}/hooks/starter`);
        const result = yield* TestHook.run({ directory: "hooks/starter" });
        expect(result.fixtures).toHaveLength(2);
        expect(
          result.fixtures.map((fixture) => ({ id: fixture.fixture, outcome: fixture.outcome })),
        ).toEqual([
          { id: "applicable", outcome: "passed" },
          { id: "nonapplicable", outcome: "passed" },
        ]);
        expect(result.nativeInvocation).toBe("not-observed");
      }).pipe(Effect.provide(authoringWorkspaceLayer(workspace)));
    });
  }
});
