import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { PACK_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { ACQUIRED_EXTENSIONS_DIR } from "../../constants.js";
import { configuredAuthoredDirectory } from "../../layout.js";
import { computePackPathsForLayout } from "../../pack-paths.js";
import { PackManifests } from "../../pack-manifests.js";

export const FilesystemPackManifests = Layer.effect(
  PackManifests,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return PackManifests.of({
      locate: ({ owner, name, sourceFamily, relativeTo, workspace }) => {
        const directory =
          "layout" in workspace
            ? computePackPathsForLayout(path.join, workspace.layout, sourceFamily, owner, name)
                .canonicalPath
            : path.join(
                workspace.baseDir,
                sourceFamily === "workspace"
                  ? configuredAuthoredDirectory(workspace.settings, "pack")
                  : path.join(ACQUIRED_EXTENSIONS_DIR, sourceFamily, owner, "packs"),
                name,
              );
        const manifestPath = path.join(directory, PACK_MANIFEST_FILENAME);
        return {
          path: manifestPath,
          relativePath: path.relative(relativeTo, manifestPath),
          contents: fs
            .readFileString(manifestPath)
            .pipe(Effect.match({ onSuccess: (contents) => contents, onFailure: () => undefined })),
        };
      },
    });
  }),
);
