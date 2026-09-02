import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  JsonErrorEnvelopeSchema,
  classifyError,
  handleInstall,
} from "axm.sh/specification-harness";

import { defineSpecification } from "../support/contract.js";
import { makeSpecWorkspace } from "../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/machine-errors-use-the-stable-envelope",
  title: "A failed machine invocation still emits the stable error envelope",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["contract", "decision-table"],
});

const decodeEnvelope = Schema.decodeUnknownEffect(JsonErrorEnvelopeSchema);

const failureRows: ReadonlyArray<{
  readonly label: string;
  readonly source: (root: string) => string;
}> = [
  {
    label: "a local package path that does not exist",
    source: (root) => path.join(root, "vendor", "no-such-package"),
  },
  {
    label: "a bare name that is not an installable source",
    source: () => "not-an-installable-source",
  },
];

describe("Machine error envelope", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect.each(failureRows)(
    "$label fails into one schema-backed error document with diagnostics kept aside",
    (row) =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
        cleanups.push(workspace.cleanup);

        const failure = yield* handleInstall({
          source: Option.some(row.source(workspace.root)),
          yes: true,
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer), Effect.flip);

        const classified = classifyError(failure, "json");

        expect(classified.exitCode).toBeGreaterThan(0);
        expect(classified.stdout).toBeDefined();
        const parsed: unknown = JSON.parse(classified.stdout ?? "");
        const envelope = yield* decodeEnvelope(parsed);
        expect(envelope.ok).toBe(false);
        expect(envelope.code.length).toBeGreaterThan(0);
        expect(envelope.detail.length).toBeGreaterThan(0);

        const stderrLines = classified.stderr ?? [];
        expect(stderrLines.length).toBeGreaterThanOrEqual(1);
        for (const line of stderrLines) {
          const event: unknown = JSON.parse(line);
          expect(typeof event).toBe("object");
        }
      }),
  );
});
