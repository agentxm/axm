/**
 * The starter content a new hook is created with, including the matcher a
 * tool-scoped binding defaults to.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  HOOK_EXTENSION_DIR,
  HOOK_MANIFEST_FILENAME,
  HOOK_MANIFEST_SCHEMA_URL,
  type HookEvent,
  type HookManifest,
  type HookRuntime,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";

import { manifestText, stageFileAt, type AuthoredScaffold } from "./scaffold.js";

const INITIAL_VERSION = decodeVersionSync("0.1.0");

/**
 * Tool events fire on every tool call, so a scaffold that bound them without
 * a matcher would run the new hook against unrelated tools from its first
 * invocation. The two write tools are the ones an author almost always means.
 */
const DEFAULT_TOOL_MATCHER = "Write|Edit";

/** Only tool-scoped events carry a matcher; the rest ignore one if given. */
const isToolEvent = (event: HookEvent): boolean => event === "tool.pre" || event === "tool.post";

export const hookEntrypointFilename = (runtime: HookRuntime): string => {
  switch (runtime) {
    case "bash":
      return "hook.sh";
    case "node":
      return "hook.js";
    case "python":
      return "hook.py";
  }
};

const entrypointBody = (runtime: HookRuntime, fqn: string): string => {
  switch (runtime) {
    case "bash":
      return `#!/usr/bin/env bash
# ${fqn}
# Receives the agent hook event payload as JSON on stdin.
set -euo pipefail

payload="$(cat)"

# TODO: inspect "$payload" and implement the hook.
# Emit JSON on stdout or exit non-zero to influence the agent.
exit 0
`;
    case "node":
      return `#!/usr/bin/env node
// ${fqn}
// Receives the agent hook event payload as JSON on stdin.
let raw = "";
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  const payload = raw ? JSON.parse(raw) : {};

  // TODO: inspect payload and implement the hook.
  // Emit JSON on stdout or exit non-zero to influence the agent.
  process.exit(0);
});
`;
    case "python":
      return `#!/usr/bin/env python3
"""${fqn}

Receives the agent hook event payload as JSON on stdin.
"""
import json
import sys

raw = sys.stdin.read()
payload = json.loads(raw) if raw else {}

# TODO: inspect payload and implement the hook.
# Emit JSON on stdout or exit non-zero to influence the agent.
sys.exit(0)
`;
  }
};

export const hookScaffold = (args: {
  readonly name: string;
  readonly owner: Handle;
  readonly runtime: HookRuntime;
  readonly event: HookEvent;
  readonly matcher: Option.Option<string>;
}): AuthoredScaffold => {
  const entrypointFile = hookEntrypointFilename(args.runtime);
  const entrypoint = `src/${entrypointFile}`;
  const matcher = isToolEvent(args.event)
    ? Option.getOrElse(args.matcher, () => DEFAULT_TOOL_MATCHER)
    : undefined;
  const fqn = `${args.owner}/${HOOK_EXTENSION_DIR}/${args.name}`;
  const manifest: HookManifest = {
    $schema: HOOK_MANIFEST_SCHEMA_URL,
    owner: args.owner,
    type: "hook",
    name: decodeExtensionNameSync(args.name),
    version: INITIAL_VERSION,
    runtime: args.runtime,
    entrypoint,
    bindings: [
      matcher === undefined ? { on: args.event } : { on: args.event, matcherRaw: matcher },
    ],
  };
  return {
    subject: "Hook",
    version: INITIAL_VERSION,
    contentFiles: [HOOK_MANIFEST_FILENAME, entrypoint],
    entryFile: entrypoint,
    populate: (stagingPath) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        yield* stageFileAt({
          path: path.join(stagingPath, HOOK_MANIFEST_FILENAME),
          contents: manifestText(manifest),
        });
        yield* stageFileAt({
          path: path.join(stagingPath, "src", entrypointFile),
          contents: entrypointBody(args.runtime, fqn),
        });
      }),
  };
};
