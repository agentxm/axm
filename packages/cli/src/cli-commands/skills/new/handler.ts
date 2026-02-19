/**
 * Skills new handler — scaffolds a new skill with `axm-skill.json`, `SKILL.md`,
 * registers in settings, and creates agent symlinks.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { getAgentById } from "../../../agents/index.js";
import { makeCliError } from "../../../cli-error/index.js";
import type { SkillManifest } from "../../../extensions/skills/manifest-schema.js";
import { Log } from "../../../tui/index.js";
import { createSymlink } from "../../../utils/create-symlink.js";
import { Workspace } from "../../../workspace/index.js";
import { MANIFEST_FILENAME } from "../constants.js";
import { computeSkillPaths } from "../skill-paths.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_NAME_LENGTH = 64;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SkillsNewHandlerArgs {
  readonly name: string;
  readonly scope: Option.Option<string>;
  readonly agents: Option.Option<readonly string[]>;
  readonly yes: boolean;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const normalizeScope = (s: string) => (s.startsWith("@") ? s : `@${s}`);

const makeSkillMd = (name: string) =>
  `---
name: ${name}
description: A new skill
---

Describe what this skill does and when to use it.
`;

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export const handleSkillsNew = Effect.fn("SkillsNew.handle")(function* (
  args: SkillsNewHandlerArgs,
) {
  const ws = yield* Workspace;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const log = yield* Log;

  yield* log.info("axm skills new");

  // 1. Resolve scope
  const scope = Option.isSome(args.scope)
    ? normalizeScope(args.scope.value)
    : yield* ws.getConfiguredScope().pipe(
        Effect.flatMap((s) =>
          s === "@community"
            ? Effect.fail(
                makeCliError({
                  code: "SCOPE_REQUIRED",
                  what: "No scope configured for skill creation",
                  howToFix: "Configure a scope in settings.json with `axm init`, or use --scope",
                }),
              )
            : Effect.succeed(s),
        ),
      );

  // 2. Validate name
  if (
    args.name.length === 0 ||
    args.name.length > MAX_NAME_LENGTH ||
    !NAME_PATTERN.test(args.name)
  ) {
    return yield* makeCliError({
      code: "SKILL_NAME_INVALID",
      what: `Invalid skill name: "${args.name}"`,
      details: [
        "Skill names must be lowercase, start with a letter or digit,",
        "contain only letters, digits, and hyphens, and not exceed 64 characters.",
      ],
      howToFix: "Choose a name matching /^[a-z0-9][a-z0-9-]*$/ (max 64 chars)",
    });
  }

  const fqn = `${scope}/skills/${args.name}`;
  const base = ws.baseDir;

  // 3. Check existence
  const configuredSkills = yield* ws.getConfiguredSkills();
  if (args.name in configuredSkills) {
    return yield* makeCliError({
      code: "SKILL_ALREADY_EXISTS",
      what: `Skill '${args.name}' already exists in settings`,
      howToFix: "Choose a different name or remove the existing skill first",
    });
  }

  // 4. Compute paths
  const { canonicalPath, skillSrcPath } = computeSkillPaths(
    path.join,
    base,
    { refType: "registry", scope },
    args.name,
  );

  // 5. Create directory (src/ implies canonicalPath is also created)
  yield* fs.makeDirectory(skillSrcPath, { recursive: true }).pipe(
    Effect.mapError((e) =>
      makeCliError({
        code: "SKILL_CREATE_FAILED",
        what: `Failed to create skill directory: ${skillSrcPath}`,
        cause: e,
      }),
    ),
  );

  // 6. Write manifest
  const manifest: SkillManifest = {
    name: fqn,
    version: "0.0.1",
  };

  yield* fs
    .writeFileString(
      path.join(canonicalPath, MANIFEST_FILENAME),
      JSON.stringify(manifest, null, 2) + "\n",
    )
    .pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "SKILL_CREATE_FAILED",
          what: `Failed to write skill manifest`,
          cause: e,
        }),
      ),
    );

  // 7. Write starter SKILL.md
  yield* fs.writeFileString(path.join(skillSrcPath, "SKILL.md"), makeSkillMd(args.name)).pipe(
    Effect.mapError((e) =>
      makeCliError({
        code: "SKILL_CREATE_FAILED",
        what: `Failed to write SKILL.md`,
        cause: e,
      }),
    ),
  );

  // 8. Register in settings
  yield* ws.setSkillEntry(args.name, {
    source: Option.some(fqn),
    enabled: true,
    managed: true,
  });

  // 9. Resolve agents
  const agentIds = Option.isSome(args.agents) ? args.agents.value : yield* ws.getConfiguredAgents();

  // 10. Create symlinks
  yield* Effect.forEach(
    agentIds,
    (agentId) =>
      Effect.gen(function* () {
        const maybeAgent = getAgentById(agentId);
        if (Option.isNone(maybeAgent)) return;
        const agent = maybeAgent.value;
        const link = path.join(base, agent.skills.dir, args.name);
        yield* createSymlink({ target: skillSrcPath, link });
      }),
    { concurrency: "unbounded" },
  );

  yield* log.success(`Created skill ${fqn}`);
});
