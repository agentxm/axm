import * as Effect from "effect/Effect";
import * as FastCheck from "effect/testing/FastCheck";
import { describe, expect, it } from "@effect/vitest";

import {
  decodeExtensionNameSync,
  extensionTypes,
  parseExtensionFqnParts,
  parseExtensionSpecParts,
} from "@agentxm/extension-model/unstable/extensions/common";
import { formatFqn, parseFqn } from "@agentxm/extension-model/unstable/extensions/fqn";
import {
  decodeHandleSync,
  decodeSlugSync,
  handleFromSlug,
  normalizeHandle,
  slugFromHandle,
} from "@agentxm/extension-model/unstable/extensions/handle";

import { defineSpecification } from "../support/contract.js";

export const specification = defineSpecification({
  requirement: "extension-identity/canonical-names-round-trip",
  title: "A canonical extension name always parses back to the identity that produced it",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "trustworthy-distribution"],
  methods: ["property", "example"],
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
  it.effect.prop(
    "every identity formats to a fully qualified name that parses back to the same identity",
    { owner: ownerArbitrary, type: typeArbitrary, name: nameArbitrary },
    ({ owner, type, name }) =>
      Effect.gen(function* () {
        const parsed = yield* Effect.fromResult(parseFqn(formatFqn({ owner, type, name })));
        expect(parsed).toEqual({ owner, type, name });
      }),
    { fastCheck: { numRuns: 250 } },
  );

  it.effect.prop(
    "an owner handle and its bare slug always convert into each other",
    { slug: slugArbitrary },
    ({ slug }) =>
      Effect.sync(() => {
        const handle = handleFromSlug(slug);
        expect(handle).toBe(`@${slug}`);
        expect(slugFromHandle(handle)).toBe(slug);
      }),
    { fastCheck: { numRuns: 100 } },
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

  it.effect("a version-constrained reference identifies the same extension as its plain name", () =>
    Effect.sync(() => {
      const plain = parseExtensionFqnParts("@acme/skills/code-review");
      expect(plain).toBeDefined();
      expect(parseExtensionSpecParts("@acme/skills/code-review@^1.0.0")).toEqual(plain);
    }),
  );

  it.effect("padded or upper-cased owner input normalizes to the canonical handle", () =>
    Effect.sync(() => {
      expect(normalizeHandle("  @ACME ")).toBe("@acme");
    }),
  );
});
