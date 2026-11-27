import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_SEARCH_TOKENIZER_PROFILE,
  parseKnowledgeSearchQuery,
  tokenizeKnowledgeSearchText,
} from "./knowledge-search.js";

describe("Knowledge search query", () => {
  it("publishes a stable normalization profile", () => {
    expect(KNOWLEDGE_SEARCH_TOKENIZER_PROFILE).toEqual({
      id: "axm-knowledge-lexical-v1",
      unicodeNormalization: "NFKC",
      caseNormalization: "unicode-case-fold",
      termBoundary: "unicode-whitespace-punctuation-camel-code",
      stemming: false,
    });
  });

  it("splits camel-case and code-token boundaries", () => {
    expect(tokenizeKnowledgeSearchText("HTTPResponseParser_v2")).toEqual([
      "http",
      "response",
      "parser",
      "v",
      "2",
    ]);
  });

  it("parses terms, phrases, and literals with their normalizations", () => {
    expect(
      parseKnowledgeSearchQuery('  SOURCE-of\ttruth "Spec Driven" literal:"Straße  Flow"'),
    ).toEqual({
      ok: true,
      query: {
        clauses: [
          { kind: "term", token: "source" },
          { kind: "term", token: "of" },
          { kind: "term", token: "truth" },
          { kind: "phrase", tokens: ["spec", "driven"] },
          { kind: "literal", value: "strasse  flow" },
        ],
      },
    });
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
