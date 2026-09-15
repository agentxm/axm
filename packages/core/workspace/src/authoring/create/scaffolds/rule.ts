/**
 * The starter content a new rule is created with.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  RULE_BODY_FILENAME,
  RULE_MANIFEST_FILENAME,
  RULE_MANIFEST_SCHEMA_URL,
  type RuleManifest,
} from "@agentxm/extension-model/unstable/rules/manifest-schema";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";

import { manifestText, stageFileAt, type AuthoredScaffold } from "./scaffold.js";

/** Rule bodies live under `src/` alongside every other package-body type. */
const RULE_SOURCE_DIR = "src";
const RULE_BODY = `${RULE_SOURCE_DIR}/${RULE_BODY_FILENAME}`;
const INITIAL_VERSION = decodeVersionSync("0.1.0");

export const ruleScaffold = (args: {
  readonly name: string;
  readonly owner: Handle;
  readonly title: Option.Option<string>;
}): AuthoredScaffold => {
  const name = decodeExtensionNameSync(args.name);
  const title = Option.getOrElse(args.title, () => String(name));
  const manifest: RuleManifest = {
    $schema: RULE_MANIFEST_SCHEMA_URL,
    owner: args.owner,
    name,
    version: INITIAL_VERSION,
    type: "rule",
    title,
  };
  return {
    subject: "Rule",
    version: INITIAL_VERSION,
    contentFiles: [RULE_MANIFEST_FILENAME, RULE_BODY],
    entryFile: RULE_BODY,
    populate: (stagingPath) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        yield* stageFileAt({
          path: path.join(stagingPath, RULE_MANIFEST_FILENAME),
          contents: manifestText(manifest),
        });
        yield* stageFileAt({
          path: path.join(stagingPath, RULE_SOURCE_DIR, RULE_BODY_FILENAME),
          contents: `# ${title}\n\nDescribe the behavior this rule asks agents to follow.\n`,
        });
      }),
  };
};
