/**
 * A publication the Registry refuses because the previewed publication set
 * changed before upload reports that reason, keyed by the Registry's
 * `publish_precondition_changed` problem code.
 */
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  jsonRegistryResponse,
  makeRemotePublishWorld,
  publishDocument,
  remoteRequest,
  runPublish,
} from "../test-helpers.js";

describe("Publication refused on a changed precondition", () => {
  const worlds: Array<ReturnType<typeof makeRemotePublishWorld>> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  it.effect.each([
    { code: "publish_precondition_changed", reason: "publish_precondition_changed" },
    { code: "visibility_stale_revision", reason: "integrity_conflict" },
  ])("reports $code as $reason", ({ code, reason }) =>
    Effect.gen(function* () {
      const world = makeRemotePublishWorld({
        settings: { skills: { review: "workspace" } },
        upload: () =>
          Effect.succeed(
            jsonRegistryResponse(
              {
                kind: "PreconditionFailedError",
                type: `https://registry.agentxm.ai/v1/problems/${code}`,
                title: "Precondition Failed",
                status: 412,
                detail: "The publication set changed after its preview.",
                code,
              },
              412,
            ),
          ),
      });
      worlds.push(world);
      world.write("skill", { name: "review" });

      const outcome = yield* world.provide(runPublish(remoteRequest()));

      expect(publishDocument(outcome).execution.outcomes).toEqual([
        expect.objectContaining({
          id: "@acme/skills/review",
          action: "error",
          phase: "upload_execution",
          reason,
          status: "failed",
          cause: expect.objectContaining({ problemCode: code, responseStatus: 412 }),
        }),
      ]);
    }),
  );
});
