import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  handleKnowledgeConceptQuery,
  handleKnowledgeConceptSearch,
  handleKnowledgeConceptStatus,
  KnowledgeConceptStatusOutputSchema,
} from "axm.sh/specification-harness";
import {
  makeDirectoryFixture,
  unattendedProjectSetup,
} from "../../../support/directory-harness.js";
import {
  knowledgeDocument,
  knowledgeQueryOptions,
  makeKnowledgeSpecWorkspace,
} from "../../../support/knowledge-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/enforces-published-result-limits",
  title: "Query and search accept the published result limits",
  statement:
    "When a Knowledge query or search selects a result limit, AXM shall accept only whole-number limits from 1 through 100 and return no more than that many concepts on a page.",
  class: "functional",
  role: "interface",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  boundary: "process",
  boundaryRationale:
    "The built command parser establishes whole-number input rejection; production handlers over an inspected corpus establish advertised range validation and page size.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "packages/cli/help/topics/knowledge.md",
    "packages/cli/src/root/knowledge/concepts/query.ts",
    "packages/cli/src/root/knowledge/concepts/search.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Published concept result limits", () => {
  const commands = [
    {
      name: "query",
      run: (resultLimit: number) =>
        handleKnowledgeConceptQuery("project", {
          ...knowledgeQueryOptions,
          expression: "session",
          resultLimit,
        }),
    },
    {
      name: "search",
      run: (resultLimit: number) =>
        handleKnowledgeConceptSearch("session", "project", { resultLimit }),
    },
  ];
  for (const command of commands) {
    it.effect(`${command.name} enforces the advertised range and page limit`, () => {
      const workspace = makeKnowledgeSpecWorkspace({
        bundles: [
          {
            name: "platform",
            documents: Object.fromEntries(
              Array.from({ length: 101 }, (_, index) => [
                `session-${index}.md`,
                knowledgeDocument("# Session\n"),
              ]),
            ),
          },
        ],
      });
      return workspace.provide(
        Effect.gen(function* () {
          yield* handleKnowledgeConceptStatus();
          const { capabilities } = Schema.decodeUnknownSync(KnowledgeConceptStatusOutputSchema)(
            workspace.rendererState.results.at(-1)?.data,
          );
          const maximum = capabilities.limits.maximumPageSize;
          expect(maximum).toBe(100);
          for (const resultLimit of [1, maximum]) {
            yield* command.run(resultLimit);
            const page = workspace.readQueryPage();
            expect(page.count).toBe(101);
            expect(page.items).toHaveLength(resultLimit);
            expect(page.hasMore).toBe(true);
          }
          for (const resultLimit of [0, maximum + 1]) {
            workspace.rendererState.results.length = 0;
            const result = yield* Effect.result(command.run(resultLimit));
            expect(Result.isFailure(result) && result.failure).toMatchObject({
              code: "validation",
            });
            expect(workspace.rendererState.results).toEqual([]);
          }
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
    it(`${command.name} rejects fractional public input in an initialized workspace`, async () => {
      const fixture = makeDirectoryFixture();
      try {
        const setup = await fixture.run(["-C", fixture.selected, ...unattendedProjectSetup]);
        expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
        const commandArgs = command.name === "search" ? ["search", "session"] : ["query"];
        const run = (limit: string) =>
          fixture.run([
            "-C",
            fixture.selected,
            "knowledge",
            "concepts",
            ...commandArgs,
            "--limit",
            limit,
            "--non-interactive",
            "--json",
          ]);
        const valid = await run("1");
        expect(valid.exitCode, valid.stdout + valid.stderr).toBe(0);
        for (const limit of ["1.5", "-0.5"]) {
          const rejected = await run(limit);
          expect(rejected.exitCode, rejected.stdout + rejected.stderr).not.toBe(0);
          expect(rejected.stdout + rejected.stderr).toContain("limit");
        }
      } finally {
        fixture.cleanup();
      }
    }, 30000);
  }
});
