import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FileSystemRecorder } from "@agentxm/test-support";

import { authoringWorkspaceLayer, makeAuthoringWorkspace } from "./authoring-workspace.js";
import { recordingAuthoringWorkspaceLayer } from "./recording-authoring-workspace.js";

describe("recording authoring workspace", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  // The count tests measure this composition while the specifications run the
  // shared one, so a service added to or removed from either one fails here.
  // A swapped implementation of the same service is not detected.
  it.effect("provides the shared authoring services plus only the recorder", () =>
    Effect.gen(function* () {
      const workspace = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
      cleanups.push(workspace.cleanup);
      const keys = (context: { readonly mapUnsafe: ReadonlyMap<string, unknown> }) =>
        [...context.mapUnsafe.keys()].sort();
      const shared = keys(yield* Layer.build(authoringWorkspaceLayer(workspace)));
      const recording = keys(yield* Layer.build(recordingAuthoringWorkspaceLayer(workspace)));
      expect(recording).toEqual([...shared, FileSystemRecorder.key].sort());
    }).pipe(Effect.scoped),
  );
});
