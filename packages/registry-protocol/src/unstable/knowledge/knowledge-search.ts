import type { KnowledgeConcept } from "./okf.js";

export const KNOWLEDGE_SEARCH_TOKENIZER_PROFILE = {
  id: "axm-knowledge-lexical-v1",
  unicodeNormalization: "NFKC",
  caseNormalization: "unicode-case-fold",
  termBoundary: "unicode-whitespace-punctuation-camel-code",
  stemming: false,
} as const;

export type KnowledgeSearchClause =
  | { readonly kind: "term"; readonly token: string }
  | { readonly kind: "phrase"; readonly tokens: ReadonlyArray<string> }
  | { readonly kind: "literal"; readonly value: string };

export interface KnowledgeSearchQuery {
  readonly clauses: ReadonlyArray<KnowledgeSearchClause>;
}

export type KnowledgeSearchQueryParseResult =
  | { readonly ok: true; readonly query: KnowledgeSearchQuery }
  | { readonly ok: false; readonly detail: string };

const normalizeTokenSource = (value: string): string =>
  value
    .normalize("NFKC")
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
    .replace(/(\p{L})(\p{N})/gu, "$1 $2")
    .replace(/(\p{N})(\p{L})/gu, "$1 $2")
    // ECMAScript does not expose Unicode's CaseFolding.txt operation directly.
    // Upper-then-lower handles multi-character folds such as ß -> ss while
    // remaining deterministic and locale-independent.
    .toUpperCase()
    .toLowerCase();

export const tokenizeKnowledgeSearchText = (value: string): ReadonlyArray<string> =>
  normalizeTokenSource(value).match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];

const normalizeLiteral = (value: string): string => value.normalize("NFC").toLowerCase();

type QuotedValueResult =
  | { readonly ok: true; readonly value: string; readonly nextIndex: number }
  | { readonly ok: false };

const parseQuotedValue = (input: string, quoteIndex: number): QuotedValueResult => {
  let value = "";
  let escaped = false;
  for (let index = quoteIndex + 1; index < input.length; index += 1) {
    const character = input[index];
    if (character === undefined) break;
    if (escaped) {
      value += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      return { ok: true, value, nextIndex: index + 1 };
    }
    value += character;
  }
  return { ok: false };
};

const addOrdinaryTerms = (clauses: KnowledgeSearchClause[], value: string): void => {
  for (const token of tokenizeKnowledgeSearchText(value)) {
    clauses.push({ kind: "term", token });
  }
};

const startsWithLiteralOperator = (input: string, index: number): boolean =>
  input.slice(index, index + "literal:".length).toLowerCase() === "literal:";

export const parseKnowledgeSearchQuery = (input: string): KnowledgeSearchQueryParseResult => {
  const clauses: KnowledgeSearchClause[] = [];
  let index = 0;
  while (index < input.length) {
    if (/\s/u.test(input[index] ?? "")) {
      index += 1;
      continue;
    }

    if (startsWithLiteralOperator(input, index)) {
      index += "literal:".length;
      if (input[index] === '"') {
        const quoted = parseQuotedValue(input, index);
        if (!quoted.ok) {
          return { ok: false, detail: "Explicit literals must end with a closing quote." };
        }
        if (quoted.value.trim().length === 0) {
          return { ok: false, detail: "Explicit literals cannot be empty." };
        }
        clauses.push({ kind: "literal", value: normalizeLiteral(quoted.value) });
        index = quoted.nextIndex;
        continue;
      }

      const end = input.slice(index).search(/\s/u);
      const nextIndex = end === -1 ? input.length : index + end;
      const value = input.slice(index, nextIndex);
      if (value.length === 0) {
        return { ok: false, detail: "Explicit literals cannot be empty." };
      }
      clauses.push({ kind: "literal", value: normalizeLiteral(value) });
      index = nextIndex;
      continue;
    }

    if (input[index] === '"') {
      const quoted = parseQuotedValue(input, index);
      if (!quoted.ok) {
        return { ok: false, detail: "Quoted phrases must end with a closing quote." };
      }
      if (quoted.value.length === 0) {
        return { ok: false, detail: "Quoted phrases cannot be empty." };
      }
      const tokens = tokenizeKnowledgeSearchText(quoted.value);
      if (tokens.length === 0) {
        return {
          ok: false,
          detail: "Quoted phrases must contain at least one searchable token.",
        };
      }
      clauses.push({ kind: "phrase", tokens });
      index = quoted.nextIndex;
      continue;
    }

    let end = index;
    while (end < input.length && !/\s/u.test(input[end] ?? "") && input[end] !== '"') {
      end += 1;
    }
    addOrdinaryTerms(clauses, input.slice(index, end));
    index = end;
  }

  return clauses.length === 0
    ? { ok: false, detail: "Search query must contain at least one term, phrase, or literal." }
    : { ok: true, query: { clauses } };
};

const containsPhrase = (
  fieldTokens: ReadonlyArray<string>,
  phraseTokens: ReadonlyArray<string>,
): boolean => {
  if (phraseTokens.length > fieldTokens.length) return false;
  const finalStart = fieldTokens.length - phraseTokens.length;
  for (let start = 0; start <= finalStart; start += 1) {
    if (phraseTokens.every((token, offset) => fieldTokens[start + offset] === token)) return true;
  }
  return false;
};

const searchableFields = (concept: KnowledgeConcept): ReadonlyArray<string> => [
  concept.id,
  concept.title,
  ...(concept.description === undefined ? [] : [concept.description]),
  ...(concept.tags ?? []),
  ...(concept.type === undefined ? [] : [concept.type]),
  concept.body,
];

export const matchesKnowledgeSearchQuery = (
  concept: KnowledgeConcept,
  query: KnowledgeSearchQuery,
): boolean => {
  const fields = searchableFields(concept);
  const tokenFields = fields.map(tokenizeKnowledgeSearchText);
  const literalFields = fields.map(normalizeLiteral);
  return query.clauses.every((clause) => {
    switch (clause.kind) {
      case "term":
        return tokenFields.some((tokens) => tokens.includes(clause.token));
      case "phrase":
        return tokenFields.some((tokens) => containsPhrase(tokens, clause.tokens));
      case "literal":
        return literalFields.some((field) => field.includes(clause.value));
      default:
        return clause satisfies never;
    }
  });
};
