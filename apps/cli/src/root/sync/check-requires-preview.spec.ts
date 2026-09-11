import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { makeSpecWorkspace } from "../../test-support/install-harness.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../test-support/preview-purity.js";
import { getAppError } from "../../test-support/test-helpers.js";
import { handleSync } from "./handler.js";

export const specification = defineSpecification({
  requirement: "cli/sync/check-requires-preview",
  title: "A sync check requires preview mode",
  statement:
    "When sync is invoked with --fail-on-change without --preview, AXM shall reject the invocation as a usage error naming the supported spelling, before applying any workspace change.",
  class: "constraint",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "The refusal is a grammar decision the adapter makes before any parser-independent workspace work begins; the exit status it maps to is owned by cli/exit-codes-match-published-reference and the machine envelope by cli/machine-errors-use-the-stable-envelope.",
  methods: ["example"],
  derivedFrom: ["apps/cli/src/root/sync/handler.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Sync checks require preview", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("refuses a check without preview before repairing a divergent projection", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
        settings: { agents: ["claude-code"] },
      });
      cleanups.push(workspace.cleanup);
      // A workspace that genuinely needs reconciliation: an obsolete managed
      // entry an apply would repair. The refusal must precede that repair.
      workspace.files.writeFile(
        `${workspace.root}/.mcp.json`,
        `${JSON.stringify(
          {
            mcpServers: {
              obsolete: {
                "x-axm": {
                  v: 1,
                  managed: true,
                  ext: "@workspace/mcps/obsolete",
                  source: "inline",
                },
                command: "node",
                args: ["obsolete-server.js"],
              },
            },
          },
          null,
          2,
        )}\n`,
      );
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);

      const failure = yield* handleSync({ preview: false, failOnChange: true }).pipe(
        Effect.provide(workspace.layer),
        Effect.flip,
      );

      const error = getAppError(failure);
      expect(error.code).toBe("usage");
      expect(error.detail).toBe("--fail-on-change requires --preview");
      expect(error.suggestions).toEqual([
        {
          description: "Run the read-only convergence assertion",
          cmd: "axm sync --preview --fail-on-change",
        },
      ]);
      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
    }),
  );
});
