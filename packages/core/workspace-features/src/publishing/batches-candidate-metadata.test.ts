import { WORKSPACE_PROTECTED_STATE } from "@agentxm/test-support";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ResolutionMetadataRequestSchema } from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
import {
  makeRemotePublishWorld,
  publishDocument,
  remoteRequest,
  runPublish,
} from "./test-helpers.js";

it.effect("batches ten decoded publication identities without uploading in preview", () => {
  const names = Array.from({ length: 10 }, (_, index) => `skill-${index}`);
  const world = makeRemotePublishWorld({
    settings: { skills: Object.fromEntries(names.map((name) => [name, "workspace"])) },
  });
  for (const name of names) world.write("skill", { name });
  const before = world.snapshotProtectedState(WORKSPACE_PROTECTED_STATE);
  return world
    .provide(
      Effect.gen(function* () {
        const outcome = yield* runPublish(remoteRequest({ preview: true }));
        expect(publishDocument(outcome).counts.selected).toBe(10);
        const requests = world.requests.filter(
          (request) => new URL(request.url).pathname === "/v1/resolutions",
        );
        expect(
          requests,
          JSON.stringify(
            requests.map((request) =>
              request.body._tag === "Uint8Array"
                ? new TextDecoder().decode(request.body.body)
                : request.body._tag,
            ),
          ),
        ).toHaveLength(1);
        for (const request of requests) {
          expect(request.body._tag).toBe("Uint8Array");
          if (request.body._tag !== "Uint8Array")
            throw new Error("Expected encoded metadata request");
          const body = Schema.decodeUnknownSync(
            Schema.fromJsonString(ResolutionMetadataRequestSchema),
          )(new TextDecoder().decode(request.body.body));
          expect(body.items.map((item) => item.identity.name).sort()).toEqual(names);
        }
        expect(world.uploads).toEqual([]);
        expect(world.snapshotProtectedState(WORKSPACE_PROTECTED_STATE)).toEqual(before);
      }),
    )
    .pipe(Effect.ensuring(Effect.sync(world.cleanup)));
});
