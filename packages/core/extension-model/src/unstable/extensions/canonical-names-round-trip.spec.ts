import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { describe, expect, it } from "@effect/vitest";
import { fc as FastCheck, it as fastCheckIt } from "@fast-check/vitest";

import { decodeExtensionNameSync, extensionTypes } from "./common.js";
import { formatFqn, parseFqn } from "./fqn.js";
import { decodeHandleSync, decodeSlugSync, handleFromSlug, slugFromHandle } from "./handle.js";

import { defineSpecification } from "@agentxm/specification-metadata";

export const specification = defineSpecification({
  requirement: "extension-identity/canonical-names-round-trip",
  title: "A canonical extension name always parses back to the identity that produced it",
  statement:
    "A fully qualified name or owner handle produced from an extension identity shall parse back to exactly that identity.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "trustworthy-distribution"],
  methods: ["property", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

// Generators draw from the published identifier grammar: handles are
// `@<slug>`, extension names are lowercase alphanumerics with inner hyphens.
// Lengths are capped below the grammar's limits to keep runs fast; the exact
// length boundary is claimed in the malformed-names specification.
const ownerArbitrary = FastCheck.stringMatching(/^@[a-z0-9_](?:[a-z0-9_-]{0,18}[a-z0-9_])?$/).map(
  decodeHandleSync,
);
const nameArbitrary = FastCheck.stringMatching(/^[a-z0-9](?:[a-z0-9-]{0,18}[a-z0-9])?$/).map(
  decodeExtensionNameSync,
);
const typeArbitrary = FastCheck.constantFrom(...extensionTypes);
const slugArbitrary = FastCheck.stringMatching(/^[a-z0-9_](?:[a-z0-9_-]{0,18}[a-z0-9_])?$/).map(
  decodeSlugSync,
);

describe("Canonical extension names round-trip", () => {
  fastCheckIt.prop(
    { owner: ownerArbitrary, type: typeArbitrary, name: nameArbitrary },
    { numRuns: 250 },
  )(
    "every identity formats to a fully qualified name that parses back to the same identity",
    ({ owner, type, name }) => {
      const parsed = parseFqn(formatFqn({ owner, type, name }));
      expect(parsed).toEqual(Result.succeed({ owner, type, name }));
    },
  );

  fastCheckIt.prop({ slug: slugArbitrary }, { numRuns: 100 })(
    "an owner handle and its bare slug always convert into each other",
    ({ slug }) => {
      const handle = handleFromSlug(slug);
      expect(handle).toBe(`@${slug}`);
      expect(slugFromHandle(handle)).toBe(slug);
    },
  );

  it.effect.each([
    { fqn: "@acme/skills/code-review", owner: "@acme", type: "skill", name: "code-review" },
    { fqn: "@acme/mcps/database", owner: "@acme", type: "mcp-server", name: "database" },
    { fqn: "@acme/subagents/reviewer", owner: "@acme", type: "subagent", name: "reviewer" },
    { fqn: "@acme/rules/review-checklist", owner: "@acme", type: "rule", name: "review-checklist" },
    { fqn: "@acme/hooks/pre-commit", owner: "@acme", type: "hook", name: "pre-commit" },
    {
      fqn: "@acme/knowledge/effect-guides",
      owner: "@acme",
      type: "knowledge",
      name: "effect-guides",
    },
    { fqn: "@acme/packs/fullstack", owner: "@acme", type: "pack", name: "fullstack" },
  ] as const)("the canonical form $fqn names one $type", ({ fqn, owner, type, name }) =>
    Effect.gen(function* () {
      const parsed = yield* Effect.fromResult(parseFqn(fqn));
      expect(parsed).toEqual({ owner, type, name });
      expect(formatFqn(parsed)).toBe(fqn);
    }),
  );
});
