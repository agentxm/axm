import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { inspectKnowledgeEntries } from "./index.js";

export const specification = defineSpecification({
  requirement: "knowledge/inspection/titles-prefer-frontmatter",
  title: "Concept titles prefer the authored frontmatter title",
  statement:
    "When inspecting a Knowledge document, AXM shall take its display title from a non-empty frontmatter title, else its first level-one heading outside code, else its concept ID, and shall report a missing title only when the document has neither a frontmatter title nor a level-one heading.",
  class: "functional",
  role: "interface",
  goals: ["knowledge-access", "actionable-diagnostics"],
  methods: ["decision-table"],
  derivedFrom: [
    "agent_extensions/registry.agentxm.ai/@craigsmitham/skills/okf/src/references/SPEC.md",
    "apps/cli/help/topics/knowledge.md",
  ],
  supersedes: [],
  assumptions: [
    "OKF 0.2 §4.1 names frontmatter title as the display name and lets consumers derive one when it is omitted.",
  ],
  openQuestions: [],
});

const concept = (frontmatter: string, body: string): string =>
  `---\ntype: reference\ndescription: Fixture\ntags: [fixture]\n${frontmatter}---\n${body}`;

describe("Concept display titles", () => {
  it.effect.each([
    [
      "a frontmatter title over a heading",
      "title: Session lifecycle\n",
      "# Sessions\n",
      "Session lifecycle",
      "frontmatter",
      "Sessions",
      false,
    ],
    [
      "a frontmatter title without a heading",
      "title: Session lifecycle\n",
      "Body.\n",
      "Session lifecycle",
      "frontmatter",
      undefined,
      false,
    ],
    [
      "the heading when the title is blank",
      'title: "  "\n',
      "# Sessions\n",
      "Sessions",
      "heading",
      "Sessions",
      false,
    ],
    [
      "the heading when the title is not a string",
      "title: 42\n",
      "# Sessions\n",
      "Sessions",
      "heading",
      "Sessions",
      false,
    ],
    [
      "a setext level-one heading",
      "",
      "Sessions\n========\n",
      "Sessions",
      "heading",
      "Sessions",
      false,
    ],
    [
      "the concept ID when the only level-one line is fenced code",
      "",
      "```sh\n# install\n```\n",
      "auth/session",
      "concept-id",
      undefined,
      true,
    ],
    ["the concept ID without either", "", "Body.\n", "auth/session", "concept-id", undefined, true],
  ] as const)("uses %s", ([, frontmatter, body, title, titleSource, authoredTitle, missing]) =>
    Effect.gen(function* () {
      const source = concept(frontmatter, body);
      const inspected = yield* inspectKnowledgeEntries(
        [{ relativePath: "auth/session.md", type: "File", size: BigInt(source.length) }],
        () => Effect.succeed(source),
      );
      const [inspectedConcept] = inspected.concepts;
      expect(inspectedConcept?.title).toBe(title);
      expect(inspectedConcept?.titleSource).toBe(titleSource);
      expect(inspectedConcept?.authoredTitle).toBe(authoredTitle);
      expect(inspected.diagnostics.some(({ code }) => code === "missing-title")).toBe(missing);
    }),
  );
});
