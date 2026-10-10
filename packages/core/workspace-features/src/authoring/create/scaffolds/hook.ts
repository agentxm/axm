/** Working, native-protocol hook examples. Creation does not activate executable code. */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  HOOK_MANIFEST_FILENAME,
  HOOK_MANIFEST_SCHEMA_URL,
  type HookImplementation,
  type HookManifest,
  type HookRuntime,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { manifestText, stageFileAt, type AuthoredScaffold } from "./scaffold.js";

const INITIAL_VERSION = decodeVersionSync("0.1.0");
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

/** The example logs only the explicitly selected native event; it makes no decision. */
const entrypointBody = (runtime: HookRuntime): string => {
  switch (runtime) {
    case "node":
      return `#!/usr/bin/env node
// Native JSON is delivered unchanged on stdin. argv[2] is the selected event.
async function main() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) raw += chunk;
  const payload = JSON.parse(raw);
  if (payload.hook_event_name === process.argv[2]) {
    process.stderr.write("AXM hook received " + process.argv[2] + "\\n");
  }
}
main().catch(() => { process.exitCode = 1; });
`;
    case "python":
      return `#!/usr/bin/env python3
import json
import sys
payload = json.load(sys.stdin)
if payload.get("hook_event_name") == sys.argv[1]:
    print("AXM hook received " + sys.argv[1], file=sys.stderr)
`;
    case "bash":
      return `#!/usr/bin/env bash
# Native event dispatch is owned by the host. This example logs a matching name.
set -euo pipefail
payload="$(cat)"
if [[ "$payload" == *"\\"hook_event_name\\""* && "$payload" == *"\\"$1\\""* ]]; then
  printf 'AXM hook received %s\\n' "$1" >&2
fi
`;
  }
};

export const hookScaffold = (args: {
  readonly name: string;
  readonly owner: Handle;
  readonly description?: string | undefined;
  readonly runtime: HookRuntime;
  readonly protocol: HookImplementation["protocol"];
  readonly event: string;
  readonly matcher: Option.Option<string>;
}): AuthoredScaffold => {
  const entrypoint = `src/${hookEntrypointFilename(args.runtime)}`;
  const implementation = "native";
  const binding = "event-log";
  const manifest: HookManifest = {
    $schema: HOOK_MANIFEST_SCHEMA_URL,
    owner: args.owner,
    type: "hook",
    name: decodeExtensionNameSync(args.name),
    version: INITIAL_VERSION,
    ...(args.description === undefined ? {} : { description: args.description }),
    implementations: [
      {
        id: implementation,
        protocol: args.protocol,
        bindings: [
          {
            id: binding,
            event: args.event,
            ...(Option.isSome(args.matcher) ? { matcher: args.matcher.value } : {}),
            handler: {
              type: "command",
              runtime: args.runtime,
              entrypoint,
              args: [args.event],
              timeoutMs: 5000,
            },
          },
        ],
      },
    ],
    fixtures: [
      {
        id: "applicable",
        implementation,
        binding,
        input: "fixtures/applicable.json",
        expect: { exitCode: 0, stdout: "fixtures/empty.txt", stderr: "fixtures/log.txt" },
      },
      {
        id: "nonapplicable",
        implementation,
        binding,
        input: "fixtures/nonapplicable.json",
        expect: { exitCode: 0, stdout: "fixtures/empty.txt", stderr: "fixtures/empty.txt" },
      },
    ],
  };
  const files = {
    [HOOK_MANIFEST_FILENAME]: manifestText(manifest),
    [entrypoint]: entrypointBody(args.runtime),
    "fixtures/applicable.json": manifestText({ hook_event_name: args.event }),
    "fixtures/nonapplicable.json": manifestText({ hook_event_name: "AxmUnrelatedEvent" }),
    "fixtures/empty.txt": "",
    "fixtures/log.txt": `AXM hook received ${args.event}\n`,
  };
  return {
    subject: "Hook",
    version: INITIAL_VERSION,
    contentFiles: Object.keys(files),
    entryFile: entrypoint,
    populate: (stagingPath) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        for (const [file, contents] of Object.entries(files)) {
          yield* stageFileAt({ path: path.join(stagingPath, file), contents });
        }
      }),
  };
};
