/**
 * How the repository visibility intent reads the authored manifest.
 *
 * The canonical observation that places the declared package already reads
 * its manifest; the intent decodes `publish.visibility` from that text instead
 * of reading the file a second time. The decode stays lenient, so a manifest
 * the strict schema rejects still declares its intent, and a package of
 * another origin still declares none.
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach } from "vitest";

import { reconcile, status } from "../lifecycle/visibility.js";
import { jsonRegistryResponse, observedRevision, registryTarget } from "../test-helpers.js";
import { writeAuthoredExtension } from "../testing.js";
import { makeVisibilityWorld, visibilityEvaluation, visibilityIntent } from "./test-helpers.js";

// The recorded filesystem replaces the native one for the measured program.
const recordedPlatform = Layer.provideMerge(
  layerRecordingFileSystem(NativePlatformTest),
  NativePlatformTest,
);

describe("Repository visibility intent", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("status reads the authored manifest once", () =>
    Effect.gen(function* () {
      const intent = visibilityIntent("manifest", "private");
      const world = makeVisibilityWorld(() => jsonRegistryResponse(visibilityEvaluation(intent)), {
        manifest: "private",
        workspace: "public",
      });
      cleanups.push(world.cleanup);
      const manifestPath = nodePath.join(world.root, "skills", "review", "skill.json");

      const counts = yield* world.provide(
        Effect.gen(function* () {
          const recording = yield* FileSystemRecorder;
          recording.reset();
          yield* status(registryTarget);
          return recording.counts(manifestPath);
        }).pipe(Effect.provide(recordedPlatform)),
      );

      expect(world.requests[0]?.url.searchParams.get("intentSource")).toBe("manifest");
      expect({ readFile: counts.readFile ?? 0, access: counts.access ?? 0 }).toEqual({
        readFile: 1,
        access: 0,
      });
    }),
  );

  it.effect("a manifest the strict schema rejects still declares its intent", () =>
    Effect.gen(function* () {
      const target = "@acme/hooks/guard";
      const world = makeVisibilityWorld(
        (request) =>
          request.method === "GET"
            ? jsonRegistryResponse({
                ...visibilityEvaluation(visibilityIntent("manifest", "private")),
                target,
              })
            : jsonRegistryResponse({
                target,
                before: "public",
                after: "private",
                authority: { kind: "repository", source: "manifest", fingerprint: "unused" },
                result: "changed",
                revision: "opaque-new-revision",
              }),
        { workspace: "public" },
      );
      cleanups.push(world.cleanup);
      fs.writeFileSync(
        nodePath.join(world.root, "axm.json"),
        JSON.stringify({
          owner: "@acme",
          agents: [],
          skills: { review: "workspace" },
          hooks: { guard: "workspace" },
          publish: { defaultVisibility: "public" },
        }),
      );
      const hookRoot = writeAuthoredExtension(world.root, "hook", { name: "guard" });
      // No implementations: the hook manifest schema rejects it.
      fs.writeFileSync(
        nodePath.join(hookRoot, "hook.json"),
        JSON.stringify({
          owner: "@acme",
          type: "hook",
          name: "guard",
          version: "1.0.0",
          publish: { visibility: "private" },
        }),
      );

      yield* world.provide(reconcile({ target }).pipe(Effect.exit));

      expect(world.requests.map(({ method }) => method)).toEqual(["GET", "PATCH"]);
      expect(world.requests[0]?.url.searchParams.get("intentSource")).toBe("manifest");
      expect(world.requests[1]).toMatchObject({
        ifMatch: observedRevision,
        body: {
          visibility: "private",
          authority: { kind: "repository", source: "manifest" },
        },
      });
    }),
  );

  it.effect("a manifest of another origin declares no intent", () =>
    Effect.gen(function* () {
      const world = makeVisibilityWorld(() => jsonRegistryResponse(visibilityEvaluation(null)));
      cleanups.push(world.cleanup);
      fs.writeFileSync(
        nodePath.join(world.root, "skills", "review", "skill.json"),
        JSON.stringify({
          owner: "@other",
          type: "skill",
          name: "review",
          version: "1.0.0",
          publish: { visibility: "private" },
        }),
      );

      yield* world.provide(status(registryTarget));

      expect(world.requests).toHaveLength(1);
      expect(Object.fromEntries(world.requests[0]?.url.searchParams ?? [])).toEqual({});
    }),
  );
});
