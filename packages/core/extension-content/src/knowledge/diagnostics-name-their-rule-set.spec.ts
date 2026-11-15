import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  KNOWLEDGE_CONFORMANCE_RULES,
  KNOWLEDGE_DIAGNOSTIC_CLASSIFICATIONS,
  KNOWLEDGE_DIAGNOSTIC_CODES,
  KNOWLEDGE_RULE_SETS,
  inspectKnowledgeEntries,
} from "./index.js";

export const specification = defineSpecification({
  requirement: "knowledge/inspection/diagnostics-name-their-rule-set",
  title: "Knowledge diagnostics separate OKF conformance from profile and safety checks",
  statement:
    "When inspecting a Knowledge bundle, AXM shall name on every diagnostic exactly one rule set, reporting OKF conformance, with the failed rule, only for a failure of one of the three OKF 0.2 §11 conformance rules, the AgentXM profile for every other knowledge-quality check including guidance OKF leaves soft, and Registry safety for limits, containment, active content, and secrets.",
  class: "functional",
  role: "interface",
  goals: ["knowledge-access", "actionable-diagnostics"],
  methods: ["example", "model"],
  derivedFrom: [
    "agent_extensions/registry.agentxm.ai/@craigsmitham/skills/okf/src/references/SPEC.md",
    "packages/core/extension-content/src/knowledge/okf.test.ts",
  ],
  supersedes: [],
  assumptions: [
    "OKF 0.2 §11 is the complete base conformance contract; every other OKF constraint is soft guidance.",
    "Rule 3 holds an index to §8 (no frontmatter beyond a bundle-root okf_version, entries grouped under headings) and a log to the one §9 MUST (ISO 8601 date headings); log frontmatter and newest-first ordering, which §9 does not require, are profile.",
  ],
  openQuestions: [],
});

const inspect = (contents: ReadonlyMap<string, string>) =>
  inspectKnowledgeEntries(
    [...contents].map(([relativePath, content]) => ({
      relativePath,
      type: "File" as const,
      size: BigInt(content.length),
    })),
    (relativePath) => Effect.succeed(contents.get(relativePath) ?? ""),
  );

const conformant = '---\nokf_version: "0.2"\n---\n# Bundle\n\n- [Concept](concept.md)\n';

describe("Knowledge diagnostic rule sets", () => {
  it("enumerates the three conformance rules in specification order", () => {
    expect(KNOWLEDGE_RULE_SETS).toEqual(["okf-conformance", "agentxm-profile", "registry-safety"]);
    expect(KNOWLEDGE_CONFORMANCE_RULES.map(({ id }) => id)).toEqual([
      "parseable-frontmatter",
      "non-empty-type",
      "reserved-file-structure",
    ]);
  });

  it("classifies every code, naming a conformance rule exactly for conformance codes", () => {
    const ruleIds: ReadonlyArray<string> = KNOWLEDGE_CONFORMANCE_RULES.map(({ id }) => id);
    for (const code of KNOWLEDGE_DIAGNOSTIC_CODES) {
      const classification = KNOWLEDGE_DIAGNOSTIC_CLASSIFICATIONS[code];
      expect(KNOWLEDGE_RULE_SETS).toContain(classification.ruleSet);
      if (classification.ruleSet === "okf-conformance") {
        expect(ruleIds).toContain(classification.conformanceRule);
      } else {
        expect(classification.conformanceRule).toBeUndefined();
      }
    }
    expect(
      KNOWLEDGE_DIAGNOSTIC_CODES.filter(
        (code) => KNOWLEDGE_DIAGNOSTIC_CLASSIFICATIONS[code].ruleSet === "okf-conformance",
      ),
    ).toEqual([
      "missing-type",
      "invalid-frontmatter",
      "invalid-index",
      "invalid-log",
      "missing-frontmatter",
    ]);
  });

  it.effect("attributes each §11 failure to the rule it breaks", () =>
    Effect.gen(function* () {
      const inspected = yield* inspect(
        new Map([
          ["index.md", conformant],
          ["unparseable.md", "---\ntype: [broken\n---\n# Unparseable\n"],
          ["bare.md", "# Bare\n"],
          ["untyped.md", "---\ndescription: No type\n---\n# Untyped\n"],
          ["nested/index.md", '---\nokf_version: "0.2"\n---\n# Nested\n'],
          ["flat/index.md", "- [Concept](../concept.md)\n"],
          ["broken/index.md", "---\ntitle: [broken\n---\n# Broken\n"],
          ["log.md", "# Log\n\n## May 5\n"],
        ]),
      );
      expect(
        inspected.diagnostics
          .filter(({ ruleSet }) => ruleSet === "okf-conformance")
          .map(({ relativePath, code, conformanceRule }) => ({
            relativePath,
            code,
            conformanceRule,
          })),
      ).toEqual([
        {
          relativePath: "bare.md",
          code: "missing-frontmatter",
          conformanceRule: "parseable-frontmatter",
        },
        {
          relativePath: "broken/index.md",
          code: "invalid-index",
          conformanceRule: "reserved-file-structure",
        },
        {
          relativePath: "flat/index.md",
          code: "invalid-index",
          conformanceRule: "reserved-file-structure",
        },
        { relativePath: "log.md", code: "invalid-log", conformanceRule: "reserved-file-structure" },
        {
          relativePath: "nested/index.md",
          code: "invalid-index",
          conformanceRule: "reserved-file-structure",
        },
        {
          relativePath: "unparseable.md",
          code: "invalid-frontmatter",
          conformanceRule: "parseable-frontmatter",
        },
        { relativePath: "untyped.md", code: "missing-type", conformanceRule: "non-empty-type" },
      ]);
    }),
  );

  it.effect.each([
    ["a key beside okf_version", '---\nokf_version: "0.2"\ntitle: Bundle\n---\n# Bundle\n'],
    ["a key without okf_version", "---\ntitle: Bundle\n---\n# Bundle\n"],
    ["a non-mapping block", "---\n- okf_version\n---\n# Bundle\n"],
    ["unparseable frontmatter", '---\nokf_version: ["0.2"\n---\n# Bundle\n'],
  ] as const)("fails the reserved-file rule for a bundle-root index with %s", ([, index]) =>
    Effect.gen(function* () {
      const inspected = yield* inspect(new Map([["index.md", index]]));
      expect(
        inspected.diagnostics
          .filter(({ ruleSet }) => ruleSet === "okf-conformance")
          .map(({ relativePath, code, conformanceRule }) => ({
            relativePath,
            code,
            conformanceRule,
          })),
      ).toEqual([
        {
          relativePath: "index.md",
          code: "invalid-index",
          conformanceRule: "reserved-file-structure",
        },
      ]);
    }),
  );

  it.effect("reads index and log headings as Markdown renders them", () =>
    Effect.gen(function* () {
      const inspected = yield* inspect(
        new Map([
          ["index.md", conformant],
          ["setext/index.md", "Section\n=======\n\n- [Concept](../concept.md)\n"],
          ["fenced/index.md", "```sh\n# comment\n```\n\n- [Concept](../concept.md)\n"],
          ["log.md", "# Log\n\n~~~\n## not a date\n~~~\n\n## 2026-05-05\n"],
        ]),
      );
      expect(
        inspected.diagnostics
          .filter(({ ruleSet }) => ruleSet === "okf-conformance")
          .map(({ relativePath, code }) => ({ relativePath, code })),
      ).toEqual([{ relativePath: "fenced/index.md", code: "invalid-index" }]);
    }),
  );

  it.effect("reports guidance OKF leaves soft under the profile, never as conformance", () =>
    Effect.gen(function* () {
      const inspected = yield* inspect(
        new Map([
          // No root index.md: OKF makes every index optional.
          ["section/index.md", "## Entries\n\n- [Missing](missing.md)\n"],
          [
            "concept.md",
            "---\ntype: reference\nstatus: published\ntimestamp: 2026-06-20T22:53:05Z\n---\nNo heading.\n\n# Citations\n\n[Broken](gone.md)\n",
          ],
          ["log.md", "---\ntitle: Log\n---\n# Log\n\n## 2026-01-01\n\n## 2026-05-05\n"],
        ]),
      );
      const codes = inspected.diagnostics.map(({ code, ruleSet }) => ({ code, ruleSet }));
      for (const code of [
        "missing-root-index",
        "missing-index-heading",
        "stale-index-entry",
        "broken-internal-link",
        "invalid-status",
        "superseded-timestamp",
        "superseded-citations",
        "unexpected-log-frontmatter",
        "unordered-log-dates",
        "missing-description",
        "missing-tags",
      ]) {
        expect(codes).toContainEqual({ code, ruleSet: "agentxm-profile" });
      }
      expect(inspected.diagnostics.some(({ ruleSet }) => ruleSet === "okf-conformance")).toBe(
        false,
      );
    }),
  );

  it.effect("reports registry protections under registry safety", () =>
    Effect.gen(function* () {
      const inspected = yield* inspect(
        new Map([
          ["index.md", conformant],
          [
            "concept.md",
            "---\ntype: reference\nresource: ../outside.txt\n---\n# Concept\n\n[unsafe](javascript:alert(1))\n\n-----BEGIN PRIVATE KEY-----\n",
          ],
        ]),
      );
      const safety = inspected.diagnostics
        .filter(({ ruleSet }) => ruleSet === "registry-safety")
        .map(({ code }) => code);
      expect(safety).toEqual(
        expect.arrayContaining(["detected-secret", "dangerous-uri", "escaping-resource"]),
      );
      expect(inspected.diagnostics.some(({ ruleSet }) => ruleSet === "okf-conformance")).toBe(
        false,
      );
    }),
  );
});
