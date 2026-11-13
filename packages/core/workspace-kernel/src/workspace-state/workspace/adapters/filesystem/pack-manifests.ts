import { freezeWorkspaceValue } from "../../../desired/freeze-value.js";
import { annotateWork, withWork } from "@agentxm/host-primitives/work-observation";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { configuredAuthoredDirectory } from "../../layout.js";
import { computePackPathsForLayout } from "../../pack-paths.js";
import {
  decodePackManifestDocument,
  PackManifests,
  type PackManifestObservation,
} from "../../pack-manifests.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";
import { CurrentWorkspaceReadPhase, CurrentWorkspaceReadRequest } from "../../read-phase.js";

export const FilesystemPackManifests = Layer.effect(
  PackManifests,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return PackManifests.of({
      locate: ({ owner, name, relativeTo, workspace }) => {
        const directory =
          "layout" in workspace
            ? computePackPathsForLayout(
                path.join,
                workspace.layout,
                { refType: "workspace", owner },
                name,
              ).canonicalPath
            : path.join(
                workspace.baseDir,
                configuredAuthoredDirectory(workspace.settings, "pack"),
                name,
              );
        const manifestPath = path.join(directory, manifestFilenameForType("pack"));
        return {
          path: manifestPath,
          relativePath: path.relative(relativeTo, manifestPath),
          // Not found is absence; every other failure is an I/O fact that
          // proves nothing about the document, and is reported as such.
          manifest: Effect.gen(function* () {
            const phase = yield* CurrentWorkspaceReadPhase;
            const read = (phase?.fileSystem ?? fs).readFileString(manifestPath).pipe(
              Effect.matchEffect({
                onSuccess: (text) =>
                  decodePackManifestDocument(text).pipe((effect) =>
                    withWork("axm.parse.manifest", effect, {
                      attributes: { "axm.manifest.kind": "pack", "axm.work.count": 1 },
                    }),
                  ),
                onFailure: (error) =>
                  Effect.succeed<PackManifestObservation>(
                    error.reason._tag === "NotFound"
                      ? { status: "absent" }
                      : { status: "unreadable", reason: error.reason._tag },
                  ),
              }),
              Effect.map(freezeWorkspaceValue),
              (effect) =>
                withWork("axm.observation.pack-document", effect, {
                  attributes: { "axm.work.count": 1 },
                }),
            );
            if (phase === undefined || !phase.isActive()) {
              yield* annotateWork({
                "axm.cache.outcome": "bypass",
                "axm.work.executed": 1,
                "axm.work.reused-count": 0,
              });
              return yield* read;
            }
            const request = { executed: false };
            const previous = phase.packDocuments.get(manifestPath);
            if (previous !== undefined) {
              yield* annotateWork({
                "axm.cache.outcome": previous.completed() ? "hit" : "coalesced",
                "axm.work.executed": 0,
                "axm.work.reused-count": 0,
              });
              return yield* previous.value.pipe(
                Effect.provideService(CurrentWorkspaceReadRequest, request),
                Effect.onExit((exit) =>
                  Exit.hasInterrupts(exit) || request.executed
                    ? Effect.void
                    : annotateWork({ "axm.work.reused-count": 1 }),
                ),
              );
            }
            let completed = false;
            let generation = 0;
            const work = read;
            const created = {
              value: yield* Effect.cached(
                Effect.gen(function* () {
                  const request = yield* CurrentWorkspaceReadRequest;
                  if (request !== undefined) request.executed = true;
                  const current = ++generation;
                  completed = false;
                  return yield* annotateWork({
                    "axm.cache.outcome": "miss",
                    "axm.work.executed": 1,
                  }).pipe(
                    Effect.andThen(work),
                    Effect.onExit((exit) =>
                      Effect.sync(() => {
                        // An abandoned run must not overwrite a retry's observation state.
                        if (generation === current) completed = !Exit.hasInterrupts(exit);
                      }),
                    ),
                  );
                }),
              ),
              completed: () => completed,
            };
            const raced = phase.packDocuments.get(manifestPath);
            const selected = raced ?? created;
            if (phase.isActive()) phase.packDocuments.set(manifestPath, selected);
            yield* annotateWork({
              "axm.cache.outcome":
                raced === undefined ? "miss" : raced.completed() ? "hit" : "coalesced",
              "axm.work.executed": 0,
              "axm.work.reused-count": 0,
            });
            return yield* selected.value.pipe(
              Effect.provideService(CurrentWorkspaceReadRequest, request),
              Effect.onExit((exit) =>
                Exit.hasInterrupts(exit) || request.executed
                  ? Effect.void
                  : annotateWork({ "axm.work.reused-count": 1 }),
              ),
            );
          }).pipe((effect) =>
            withWork("axm.observation.pack-reuse", effect, {
              attributes: { "axm.work.requested": 1 },
            }),
          ),
        };
      },
    });
  }),
);
