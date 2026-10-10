import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import { LearnMore } from "../../../formatter.js";
import { defineSpecification } from "@agentxm/specification-metadata";
import { toJsonHelpDoc, classifyError } from "../../../cli-runtime/index.js";
import { captureHelpDoc } from "../../../test-support/command-tree-test-helpers.js";
import { parserRejection, probeFlag } from "../../../test-support/parser-probe.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/query/uses-one-text-and-filter-route",
  title: "One query route accepts text and filters without a ranking explanation switch",
  statement:
    "Knowledge concept discovery shall expose one query route with an optional expression plus typed filters, reject the retired search route and explanation flag, and describe expression syntax, field assignment, JSON Pointer properties and supported filter fields through help with a Knowledge topic link.",
  class: "functional",
  role: "interface",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["contract", "example"],
  derivedFrom: [
    "cli/knowledge/concepts/query/matches-lexical-query",
    "cli/knowledge/concepts/query/combines-typed-filters",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

it.effect("publishes the single optional expression and typed filter guidance", () =>
  Effect.gen(function* () {
    const help = yield* captureHelpDoc(["knowledge", "concepts", "query"]);
    const doc = toJsonHelpDoc(help, { learnMore: Context.get(help.annotations, LearnMore) });
    expect(doc.usage).toBe("axm knowledge concepts query [flags] [<expression>]");
    expect(doc.args).toEqual([
      expect.objectContaining({
        name: "expression",
        required: false,
        description:
          'Terms to find; "phrase" for contiguous tokens, literal:"text" for exact punctuation',
      }),
    ]);
    expect(doc.learnMore).toContain("axm help knowledge");
    expect(doc.flags.find((flag) => flag.name === "field")?.description).toContain(
      "FIELD=EXPRESSION",
    );
    expect(doc.flags.find((flag) => flag.name === "field")?.description).toContain(
      "axm help knowledge",
    );
    expect(doc.flags.find((flag) => flag.name === "property")?.description).toContain(
      "RFC 6901 JSON Pointer",
    );
    expect(doc.flags.find((flag) => flag.name === "metadata")?.description).toContain(
      "bundle,conceptId,kind,title,description,tag,type,resource",
    );
    expect(doc.flags.find((flag) => flag.name === "lifecycle")?.description).toContain(
      "status,staleAfter,generated,verified,trust",
    );
    expect(yield* probeFlag(["knowledge", "concepts", "query"], "--explain")).toBe("unrecognized");
    expect(
      classifyError(yield* parserRejection(["knowledge", "concepts", "search", "session"]), "json")
        .exitCode,
    ).toBe(2);
  }),
);
