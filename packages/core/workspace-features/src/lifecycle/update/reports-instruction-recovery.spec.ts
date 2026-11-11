import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  StepFailureConversion,
  kernelFailureToStepFailure,
} from "@agentxm/workspace-kernel/reconciliation";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import {
  applyInstall,
  previewInstall,
  installRequest,
  makeInstallWorld,
} from "../../testing/install-world.js";
import { applySync } from "../../testing/sync-fixture.js";
import {
  configuredUpdateRequest,
  targetedUpdateRequest,
  previewUpdate,
  expectResolved,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/packs/reports-instruction-recovery",
  title: "Pack projection refusals retain the instruction recovery",
  statement:
    "When Pack installation or update is refused because a required instruction route is not current, AXM shall expose the affected path and the producer's explanation in the ordinary refusal and offer a sync recovery addressed to the selected workspace scope.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Production Pack planning and failure rendering inspect a missing native alias in a temporary workspace; executing sync and retrying establish that the recovery repairs the refused precondition.",
  methods: ["example"],
  derivedFrom: ["cli/non-success-results-name-a-fitting-recovery"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

for (const kind of ["rule", "knowledge"] as const)
  for (const route of ["install", "targeted-update", "bulk-update"] as const)
    it.effect(`${route} of a ${kind} Pack reports and recovers a missing instruction alias`, () => {
      const { workspace, registry, cleanup } = makeInstallWorld({
        settings: {
          agents: ["claude-code", "codex"],
          instructionFiles: { fileName: "AGENTS.md" },
        },
      });
      const versions = [{ version: "1.0.0", body: "Guidance." }];
      if (kind === "rule") registry.writeRule("policy", versions);
      else registry.writeKnowledge("policy", versions);
      registry.writePack("toolkit", [
        {
          version: "1.0.0",
          dependencies: {
            [`@acme/${kind === "rule" ? "rules" : "knowledge"}/policy`]: "^1.0.0",
          },
        },
      ]);
      const request = installRequest({
        type: "pack",
        subject: { kind: "source", source: "@acme/packs/toolkit" },
      });
      const retry = Effect.gen(function* () {
        if (route === "install") return yield* previewInstall(request);
        return expectResolved(
          yield* previewUpdate(
            route === "targeted-update"
              ? targetedUpdateRequest({ source: "@acme/packs/toolkit" })
              : configuredUpdateRequest({}),
          ),
        );
      });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(request);
            const alias = path.join(workspace.root, "CLAUDE.md");
            fs.unlinkSync(alias);
            const before = workspace.snapshot();
            const error = yield* retry.pipe(Effect.flip);
            expect(error).toMatchObject({
              category: "conflict",
              detail: expect.stringContaining(alias),
              suggestions: [{ invocation: { command: ["sync"], arguments: [] } }],
            });
            expect(workspace.snapshot()).toEqual(before);
            yield* applySync();
            expect(fs.existsSync(alias)).toBe(true);
            expect(["previewed", "no-op"]).toContain(deriveOperationOutcome(yield* retry));
          }).pipe(
            Effect.provideService(StepFailureConversion, {
              toStepFailure: kernelFailureToStepFailure,
            }),
          ),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
    });
