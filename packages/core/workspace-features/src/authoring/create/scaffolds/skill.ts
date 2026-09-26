/**
 * The starter content a new skill is created with.
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
  type SkillManifest,
} from "@agentxm/extension-model/unstable/skills/manifest-schema";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";

import { manifestText, stageFileAt, type AuthoredScaffold } from "./scaffold.js";

const SKILL_BODY = "src/SKILL.md";
const INITIAL_VERSION = decodeVersionSync("0.0.1");

const skillBody = (name: string) => `---
name: ${name}
description: Describe when this skill should be triggered by the agent
---

Describe what this skill does and when to use it.
`;

export const skillScaffold = (args: {
  readonly name: string;
  readonly owner: Handle;
}): AuthoredScaffold => {
  const manifest: SkillManifest = {
    $schema: MANIFEST_SCHEMA_URL,
    owner: args.owner,
    type: "skill",
    name: decodeExtensionNameSync(args.name),
    version: INITIAL_VERSION,
  };
  return {
    subject: "Skill",
    version: INITIAL_VERSION,
    contentFiles: [MANIFEST_FILENAME, SKILL_BODY],
    entryFile: SKILL_BODY,
    populate: (stagingPath) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        yield* stageFileAt({
          path: path.join(stagingPath, MANIFEST_FILENAME),
          contents: manifestText(manifest),
        });
        yield* stageFileAt({
          path: path.join(stagingPath, ...SKILL_BODY.split("/")),
          contents: skillBody(args.name),
        });
      }),
  };
};
