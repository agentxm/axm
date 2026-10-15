import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applySync,
  expectResolved,
  makeSyncFixture,
  writeAuthoredRule,
} from "../testing/sync-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/invalid-ownership-markers-block-reconciliation",
  title: "Malformed region fences block reconciliation",
  statement:
    "When the planned instruction file carries duplicate, nested, interleaved or unpaired fences of a region AXM writes, reconciliation shall report a blocked outcome and shall not alter any file. A fence whose name is outside AXM's region vocabulary shall not block reconciliation and shall be left untouched.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  boundaryRationale:
    "Production reconciliation reads native workspace state and realizes files and links; snapshots and generation records observe preservation, refusal and convergence.",
  boundary: "platform",
  methods: ["example", "decision-table"],
  derivedFrom: ["cli/projection-currency-follows-state-authority"],
  supersedes: [],
  assumptions: [],
  limitations: [
    {
      limitation:
        "The statement does not carry the lint half of the rule — that a workspace lint run reports malformed fences as `workspace/projection-ownership-valid` and leaves the document untouched. A reconciliation specification cannot witness a peer feature's finding, and no ordinary test in `@agentxm/workspace-features/linting` exercises that rule against malformed fences yet; the rule's identity and severity are meanwhile owned by cli/lint/catalog-is-complete and lint's no-mutation obligation by cli/lint/reports-facts-without-mutation.",
      retirementCondition:
        "`@agentxm/workspace-features/linting` carries an ordinary test that runs the real workspace lint over a document with malformed region fences and asserts the `workspace/projection-ownership-valid` finding with the document unchanged.",
    },
  ],
  openQuestions: [],
});

const OPEN = "<!-- axm:rules -->";
const CLOSE = "<!-- /axm:rules -->";

describe("Malformed region fences", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const reconciledWorkspace = () => {
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: [],
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
        rules: { review: "workspace" },
      },
    });
    cleanups.push(workspace.cleanup);
    writeAuthoredRule(workspace.root, "review", "Required guidance.");
    return workspace;
  };

  for (const [problem, malform] of [
    ["unpaired", (content: string) => content.replace(`${CLOSE}\n`, "")],
    ["duplicate", (content: string) => `${content}\n${OPEN}\nCopied guidance.\n${CLOSE}\n`],
    ["nested", (content: string) => content.replace(`${OPEN}\n`, `${OPEN}\n${OPEN}\n${CLOSE}\n`)],
    [
      "interleaved",
      (content: string) =>
        content.replace(
          `${CLOSE}\n`,
          `<!-- axm:knowledge -->\n${CLOSE}\n<!-- /axm:knowledge -->\n`,
        ),
    ],
  ] as const) {
    it.effect(`${problem} fences block reconciliation without changing any bytes`, () => {
      const workspace = reconciledWorkspace();
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            const invalid = malform(workspace.readFile("AGENTS.md"));
            workspace.writeFile("AGENTS.md", invalid);
            const before = workspace.snapshot();

            const resolution = expectResolved(yield* applySync());

            expect(deriveOperationOutcome(resolution)).toBe("blocked");
            expect(workspace.readFile("AGENTS.md")).toBe(invalid);
            expect(workspace.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });
  }

  it.effect("a fence outside the region vocabulary does not block and stays untouched", () => {
    const workspace = reconciledWorkspace();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          const withUnknown = `${workspace.readFile("AGENTS.md")}\n<!-- axm:future -->\nNotes\n<!-- /axm:future -->\n`;
          workspace.writeFile("AGENTS.md", withUnknown);

          const outcome = yield* applySync();

          if (outcome._tag === "Resolved")
            expect(deriveOperationOutcome(outcome.resolution)).not.toBe("blocked");
          expect(workspace.readFile("AGENTS.md")).toBe(withUnknown);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
