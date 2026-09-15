/**
 * The starter content a new subagent is created with.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  MANIFEST_FILENAME,
  MANIFEST_SCHEMA_URL,
  type SubagentManifest,
} from "@agentxm/extension-model/unstable/subagents/manifest-schema";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";

import { manifestText, stageFileAt, type AuthoredScaffold } from "./scaffold.js";

const INITIAL_VERSION = decodeVersionSync("0.0.1");

const subagentBody = (name: string) =>
  [
    "---",
    `name: ${name}`,
    "---",
    "",
    "Describe what this subagent does and when to delegate work to it.\n",
  ].join("\n");

export const subagentScaffold = (args: {
  readonly name: string;
  readonly owner: Handle;
}): AuthoredScaffold => {
  const body = `src/${args.name}.md`;
  const manifest: SubagentManifest = {
    $schema: MANIFEST_SCHEMA_URL,
    owner: args.owner,
    type: "subagent",
    name: decodeExtensionNameSync(args.name),
    version: INITIAL_VERSION,
  };
  return {
    subject: "Subagent",
    version: INITIAL_VERSION,
    contentFiles: [MANIFEST_FILENAME, body],
    entryFile: body,
    populate: (stagingPath) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        yield* stageFileAt({
          path: path.join(stagingPath, MANIFEST_FILENAME),
          contents: manifestText(manifest),
        });
        yield* stageFileAt({
          path: path.join(stagingPath, "src", `${args.name}.md`),
          contents: subagentBody(args.name),
        });
      }),
  };
};
