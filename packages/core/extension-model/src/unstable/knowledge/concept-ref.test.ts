import { describe, expect, it } from "vitest";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  ConceptRefSchema,
  formatConceptRef,
  KnowledgeBundleFqnSchema,
  KnowledgeConceptIdSchema,
  KnowledgeRevisionSchema,
  parseConceptRef,
  ResolvedConceptRefSchema,
} from "./concept-ref.js";

const expectSuccess = (input: string) => {
  const result = parseConceptRef(input);
  expect(Result.isSuccess(result)).toBe(true);
  return Result.isSuccess(result) ? result.success : undefined;
};

describe("Knowledge concept identity", () => {
  it("round-trips compact and canonical URL references", () => {
    const decoded = Schema.decodeUnknownSync(ConceptRefSchema)({
      bundle: "@agentxm/knowledge/platform",
      conceptId: "guides/start here",
    });

    const compact = formatConceptRef(decoded);
    const url = formatConceptRef(decoded, "url");

    expect(compact).toBe("@agentxm/knowledge/platform#guides%2Fstart%20here");
    expect(url).toBe("https://agentxm.ai/@agentxm/knowledge/platform/concepts/guides/start%20here");
    expect(expectSuccess(compact)).toEqual(decoded);
    expect(expectSuccess(url)).toEqual(decoded);
  });

  it("rejects non-Knowledge bundles, unsafe concept IDs, and non-canonical URLs", () => {
    const invalidInputs = [
      "@agentxm/skills/platform#guides/start",
      "@agentxm/knowledge/platform#../secret",
      "@agentxm/knowledge/platform#guides%5Cstart",
      "https://example.com/@agentxm/knowledge/platform/concepts/start",
      "https://agentxm.ai/@agentxm/knowledge/platform/concepts/start?view=full",
      "https://agentxm.ai/@agentxm/knowledge/platform/concepts/start#section",
    ];

    for (const input of invalidInputs) {
      expect(Result.isFailure(parseConceptRef(input)), input).toBe(true);
    }
  });

  it("validates logical and resolved reference fields independently", () => {
    const decodeBundle = Schema.decodeUnknownResult(KnowledgeBundleFqnSchema);
    const decodeConceptId = Schema.decodeUnknownResult(KnowledgeConceptIdSchema);
    const decodeRevision = Schema.decodeUnknownResult(KnowledgeRevisionSchema);
    const decodeResolved = Schema.decodeUnknownResult(ResolvedConceptRefSchema);
    const revision = `sha256:${"a".repeat(64)}`;

    expect(Result.isSuccess(decodeBundle("@agentxm/knowledge/platform"))).toBe(true);
    expect(Result.isFailure(decodeBundle("@agentxm/rules/platform"))).toBe(true);
    expect(Result.isSuccess(decodeConceptId("guides/start"))).toBe(true);
    expect(Result.isFailure(decodeConceptId("guides/start.md"))).toBe(true);
    expect(Result.isSuccess(decodeRevision(revision))).toBe(true);
    expect(Result.isFailure(decodeRevision(`sha256:${"A".repeat(64)}`))).toBe(true);
    expect(
      Result.isSuccess(
        decodeResolved({
          bundle: "@agentxm/knowledge/platform",
          conceptId: "guides/start",
          bundleVersion: "1.2.3",
          bundleFingerprint: revision,
          contentRevision: revision,
        }),
      ),
    ).toBe(true);
  });
});
