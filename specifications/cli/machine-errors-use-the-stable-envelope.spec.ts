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
  PlanResolutionDocumentSchema,
  classifyError,
  handleDemote,
  handleInstall,
  handleList,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";
import { parserRejection } from "../support/parser-probe.js";
import { writeAuthoredSkill } from "../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/machine-errors-use-the-stable-envelope",
  title: "A failed machine invocation still emits the stable error envelope",
  statement:
    "When a machine-output invocation fails, it shall exit non-zero and write exactly one schema-valid error document to standard output that carries any structured problem the failure names, keeping every diagnostic line on standard error as a structured event; when it stops as approval required, it shall write exactly one schema-valid result document that names the block and its recovery.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["contract", "decision-table"],
  derivedFrom: ["cli/lockfile-version-errors-expose-structured-problem"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodeEnvelope = Schema.decodeUnknownEffect(JsonErrorEnvelopeSchema);
const decodeResolutionDocument = Schema.decodeUnknownEffect(PlanResolutionDocumentSchema);

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

  it.effect("a flag the route does not register fails into the same envelope before any work", () =>
    Effect.gen(function* () {
      const rejection = yield* parserRejection(["skills", "enable", "code-review", "--yes"]);

      const classified = classifyError(rejection, "json");

      expect(classified.exitCode).toBeGreaterThan(0);
      const parsed: unknown = JSON.parse(classified.stdout ?? "");
      const envelope = yield* decodeEnvelope(parsed);
      expect(envelope).toMatchObject({ ok: false, code: "usage" });
      expect(envelope.detail).toContain("--yes");
      const stderrLines = classified.stderr ?? [];
      expect(stderrLines).toHaveLength(1);
      expect(JSON.parse(stderrLines[0] ?? "")).toMatchObject({ type: "error", code: "usage" });
    }),
  );

  it.effect(
    "an apply stopped as approval required writes one result document naming its recovery",
    () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          settings: { owner: "@acme", skills: { review: "workspace" } },
        });
        cleanups.push(workspace.cleanup);
        writeAuthoredSkill(workspace.root, { name: "review" });
        const replacement = writeLocalSkillPackage(workspace.root, {
          name: "review",
          body: "Replacement guidance.",
        });

        yield* handleDemote({
          fqn: "@acme/skills/review",
          source: replacement,
          yes: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));

        expect(workspace.rendererState.results).toHaveLength(1);
        const [entry] = workspace.rendererState.results;
        expect(entry?.ok).toBe(false);
        const document = yield* decodeResolutionDocument(entry?.data);
        expect(document.result.outcome).toBe("blocked");
        expect(document.result.blocking).toMatchObject({
          class: "approval-required",
          subject: "replace-workspace-authority",
          escape: { cmd: expect.stringContaining("--yes") },
        });
      }),
  );

  it.effect.each([
    { direction: "older", observedVersion: LOCKFILE_VERSION - 1 },
    { direction: "newer", observedVersion: LOCKFILE_VERSION + 1 },
  ])(
    "an $direction lockfile rejection carries its structured problem inside the stable envelope",
    (row) =>
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
