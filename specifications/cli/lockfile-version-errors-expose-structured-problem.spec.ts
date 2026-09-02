import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  JsonErrorEnvelopeSchema,
  LOCKFILE_VERSION,
  classifyError,
  handleList,
} from "axm.sh/specification-harness";

import { defineSpecification } from "../support/contract.js";
import { makeSpecWorkspace } from "../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/lockfile-version-errors-expose-structured-problem",
  title: "Lockfile version errors expose a structured machine problem",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["contract", "decision-table"],
});

const decodeEnvelope = Schema.decodeUnknownEffect(JsonErrorEnvelopeSchema);

describe("Lockfile version machine problem", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect.each([
    { direction: "older", observedVersion: LOCKFILE_VERSION - 1 },
    { direction: "newer", observedVersion: LOCKFILE_VERSION + 1 },
  ])("exposes the $direction mismatch without changing the stable envelope", (row) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      const lockPath = path.join(workspace.root, "axm-lock.yaml");
      fs.writeFileSync(lockPath, `lockfileVersion: ${row.observedVersion}\nskills: {}\n`);

      const failure = yield* workspace
        .provide(handleList({ type: Option.none(), outdated: false, deprecated: false }))
        .pipe(Effect.flip);
      const classified = classifyError(failure, "json");

      expect(classified.exitCode).toBe(9);
      expect(classified.stdout).toBeDefined();
      const parsed: unknown = JSON.parse(classified.stdout ?? "");
      const envelope = yield* decodeEnvelope(parsed);
      expect(envelope).toMatchObject({
        ok: false,
        code: "validation",
        title: "Unsupported workspace lockfile version",
        problem: {
          code: "workspace-lockfile-version-unsupported",
          path: lockPath,
          observedVersion: row.observedVersion,
          supportedVersion: LOCKFILE_VERSION,
          direction: row.direction,
        },
      });
      const commands = envelope.suggestions?.flatMap((suggestion) =>
        suggestion.cmd === undefined ? [] : [suggestion.cmd],
      );
      expect(commands).toEqual(
        row.direction === "older" ? ["axm sync --preview", "axm sync"] : ["axm upgrade"],
      );
      expect(JSON.stringify(envelope)).not.toContain("commandScope");
    }),
  );
});
