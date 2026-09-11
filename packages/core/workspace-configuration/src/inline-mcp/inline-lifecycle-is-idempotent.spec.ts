import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import type { AddInlineMcpServerRequest } from "./add-inline-mcp-server.js";
import { makeConfigurationFixture } from "../testing.js";
import { runInlineMcpAdd } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/inline-lifecycle-is-idempotent",
  title: "Repeating an inline MCP server addition is a successful no-op",
  statement:
    "When an inline MCP server is added again with an identical definition, whatever transport it carries, AXM shall report a no-op outcome and shall change neither the recorded entry nor its native projection.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["decision-table"],
  derivedFrom: ["cli/mcps/add/records-and-realizes-inline-configuration"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "Only the repeated-add half of the inline MCP lifecycle is observed here. Repeating the uninstall of an inline server runs through the extension-lifecycle uninstall use case, and a feature package may not import another feature package, so no example in this package can exercise it.",
      retirementCondition:
        "State an inline mcp-server absent case in cli/uninstall/is-idempotent's decision table, then widen this statement to cover a repeated uninstall again.",
    },
  ],
});

interface IdenticalAddRow {
  readonly label: string;
  readonly request: AddInlineMcpServerRequest;
}

/**
 * Matching a recorded entry is transport-specific — the command line, the
 * remote URL, the headers, and the environment inputs are each compared — so
 * repetition is stated over both transports rather than the command one alone.
 */
const identicalAddRows: ReadonlyArray<IdenticalAddRow> = [
  {
    label: "a command server",
    request: { name: "demo", command: "node server.js", env: [], headers: [] },
  },
  {
    label: "a remote server with headers and named environment inputs",
    request: {
      name: "demo",
      url: "https://example.test/mcp",
      env: ["CONTEXT_TOKEN", "MODE=review"],
      headers: ["X-Workspace:review-team"],
    },
  },
];

describe("Inline MCP server addition is safe to repeat", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect.each(identicalAddRows)(
    "repeating an identical add of $label changes nothing and says so",
    ({ request }) => {
      const fixture = makeConfigurationFixture({ settings: { agents: ["claude-code"] } });
      cleanups.push(fixture.cleanup);
      return fixture
        .provide(
          Effect.gen(function* () {
            yield* runInlineMcpAdd(request, "apply");
            const settingsBefore = fixture.readFile("axm.json");
            const nativeBefore = fixture.readFile(".mcp.json");
            const before = fixture.snapshot();

            const repeated = yield* runInlineMcpAdd(request, "apply");

            expect(repeated).toMatchObject({
              _tag: "Unchanged",
              name: "demo",
              message: "MCP server demo is already configured",
            });
            expect(fixture.readFile("axm.json")).toBe(settingsBefore);
            expect(fixture.readFile(".mcp.json")).toBe(nativeBefore);
            expect(fixture.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
