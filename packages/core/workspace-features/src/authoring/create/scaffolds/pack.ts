/**
 * The starter manifest a new pack is created with: an empty membership the
 * author fills with `axm packs add`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  PACK_MANIFEST_FILENAME,
  PACK_MANIFEST_SCHEMA_URL,
  type PackManifest,
} from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";

import { manifestText, stageFileAt, type AuthoredScaffold } from "./scaffold.js";

const INITIAL_VERSION = decodeVersionSync("0.0.1");

export const packScaffold = (args: {
  readonly name: string;
  readonly owner: Handle;
}): AuthoredScaffold => {
  const manifest: PackManifest = {
    $schema: PACK_MANIFEST_SCHEMA_URL,
    owner: args.owner,
    type: "pack",
    name: decodeExtensionNameSync(args.name),
    version: INITIAL_VERSION,
    dependencies: {},
  };
  return {
    subject: "Pack",
    version: INITIAL_VERSION,
    contentFiles: [PACK_MANIFEST_FILENAME],
    entryFile: PACK_MANIFEST_FILENAME,
    populate: (stagingPath) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        yield* stageFileAt({
          path: path.join(stagingPath, PACK_MANIFEST_FILENAME),
          contents: manifestText(manifest),
        });
      }),
  };
};
