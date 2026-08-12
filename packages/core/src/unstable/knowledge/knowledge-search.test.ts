import { describe, expect, it } from "vitest";
import type { KnowledgeConcept } from "./okf.js";
import {
  KNOWLEDGE_SEARCH_TOKENIZER_PROFILE,
  matchesKnowledgeSearchQuery,
  parseKnowledgeSearchQuery,
} from "./knowledge-search.js";

const concept = (args: {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly tags?: ReadonlyArray<string>;
  readonly type?: string;
  readonly body?: string;
}): KnowledgeConcept => ({
  ...args,
  kind: "concept",
  authoredLinks: [],
  relativePath: `${args.id}.md`,
  body: args.body ?? "",
});

const matches = (candidate: KnowledgeConcept, query: string): boolean => {
  const parsed = parseKnowledgeSearchQuery(query);
  expect(parsed.ok).toBe(true);
  return parsed.ok && matchesKnowledgeSearchQuery(candidate, parsed.query);
};

describe("Knowledge search query", () => {
  const hyphenated = concept({
    id: "practices/specDrivenDevelopment",
    title: "Specification guide",
    description: "Defines the desired workflow",
    tags: ["source-of-truth"],
    type: "Reference",
    body: "# SpecDrivenDevelopment\n\nTreat the spec as authoritative.",
  });

  it("publishes a stable normalization profile", () => {
    expect(KNOWLEDGE_SEARCH_TOKENIZER_PROFILE).toEqual({
      id: "axm-knowledge-lexical-v1",
      unicodeNormalization: "NFKC",
      caseNormalization: "unicode-lowercase",
      termBoundary: "unicode-whitespace-punctuation-camel-code",
      stemming: false,
    });
  });

  it.each([
    "source of truth",
    "source-of-truth",
    "specification source of truth",
    "spec as source",
    "  SOURCE  of truth  ",
    "source\tof truth",
    "source\n  of truth",
  ])(
    "matches all ordinary terms across punctuation, whitespace, case, order, and fields: %s",
    (query) => {
      expect(matches(hyphenated, query)).toBe(true);
    },
  );

  it("matches ordinary terms independently of query order", () => {
    expect(matches(hyphenated, "truth specification source")).toBe(true);
  });

  it("splits camel-case and code-token boundaries", () => {
    const codeNamed = concept({
      id: "HTTPResponseParser_v2",
      title: "HTTPResponseParser_v2",
      body: "",
    });
    expect(matches(codeNamed, "http response parser v 2")).toBe(true);
  });

  it("does not apply implicit stemming or substring matching", () => {
    expect(matches(hyphenated, "specifications")).toBe(false);
    expect(matches(hyphenated, "truthful")).toBe(false);
  });

  it("matches quoted phrases as contiguous normalized tokens", () => {
    expect(matches(hyphenated, '"source of truth"')).toBe(true);
    expect(
      matches(
        concept({ id: "noncontiguous", title: "Source durable truth", body: "" }),
        '"source of truth"',
      ),
    ).toBe(false);
  });

  it("never matches a phrase or literal by spanning searchable fields", () => {
    const splitAcrossFields = concept({
      id: "split",
      title: "Specification source",
      description: "of truth",
      body: "",
    });
    expect(matches(splitAcrossFields, '"source of truth"')).toBe(false);
    expect(matches(splitAcrossFields, 'literal:"sourceof truth"')).toBe(false);
  });

  it("matches explicit literals with authored punctuation and whitespace but normalized case", () => {
    const spaced = concept({ id: "spaced", title: "Source of truth", body: "" });
    expect(matches(hyphenated, 'literal:"SOURCE-OF-TRUTH"')).toBe(true);
    expect(matches(hyphenated, 'literal:"source of truth"')).toBe(false);
    expect(matches(spaced, 'literal:"source of truth"')).toBe(true);
    expect(matches(spaced, 'literal:"source-of-truth"')).toBe(false);
  });

  it.each([
    ["", "Search query must contain at least one term, phrase, or literal."],
    [" \t\n ", "Search query must contain at least one term, phrase, or literal."],
    ['""', "Quoted phrases cannot be empty."],
    ['"---"', "Quoted phrases must contain at least one searchable token."],
    ['literal:""', "Explicit literals cannot be empty."],
    ['"source of truth', "Quoted phrases must end with a closing quote."],
  ])("rejects invalid input %j", (query, detail) => {
    expect(parseKnowledgeSearchQuery(query)).toEqual({ ok: false, detail });
  });
});
