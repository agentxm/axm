/**
 * The starter content a new Knowledge bundle is created with.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  KNOWLEDGE_MANIFEST_FILENAME,
  KNOWLEDGE_MANIFEST_SCHEMA_URL,
  KNOWLEDGE_SOURCE_DIR,
  type KnowledgeManifest,
} from "@agentxm/extension-model/unstable/knowledge";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";

import { manifestText, stageFileAt, type AuthoredScaffold } from "./scaffold.js";

const BUNDLE_INDEX = `${KNOWLEDGE_SOURCE_DIR}/index.md`;
const INITIAL_VERSION = decodeVersionSync("0.1.0");

export const knowledgeScaffold = (args: {
  readonly name: string;
  readonly owner: Handle;
  readonly description: Option.Option<string>;
}): AuthoredScaffold => {
  const name = decodeExtensionNameSync(args.name);
  const manifest: KnowledgeManifest = {
    $schema: KNOWLEDGE_MANIFEST_SCHEMA_URL,
    owner: args.owner,
    name,
    version: INITIAL_VERSION,
    type: "knowledge",
    format: { name: "okf", version: "0.2" },
    bundleRoot: KNOWLEDGE_SOURCE_DIR,
    ...(Option.isSome(args.description) ? { description: args.description.value } : {}),
  };
  return {
    subject: "Knowledge bundle",
    version: INITIAL_VERSION,
    contentFiles: [KNOWLEDGE_MANIFEST_FILENAME, BUNDLE_INDEX],
    entryFile: BUNDLE_INDEX,
    populate: (stagingPath) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        yield* stageFileAt({
          path: path.join(stagingPath, KNOWLEDGE_MANIFEST_FILENAME),
          contents: manifestText(manifest),
        });
        yield* stageFileAt({
          path: path.join(stagingPath, KNOWLEDGE_SOURCE_DIR, "index.md"),
          contents: `---\nokf_version: "0.2"\n---\n# ${name}\n\n<!-- Discovery map: describe this bundle's scope, then group and annotate links to its concepts. -->\n`,
        });
      }),
  };
};
