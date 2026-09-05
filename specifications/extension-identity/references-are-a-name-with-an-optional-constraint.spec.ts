import * as Effect from "effect/Effect";
import * as FastCheck from "effect/testing/FastCheck";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import {
  decodeExtensionNameSync,
  ExtensionSpecSchema,
  extensionTypes,
  parseExtensionFqnParts,
  parseExtensionSpecParts,
} from "@agentxm/extension-model/unstable/extensions/common";
import { formatFqn } from "@agentxm/extension-model/unstable/extensions/fqn";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "extension-identity/references-are-a-name-with-an-optional-constraint",
  title: "An extension reference is a fully qualified name with an optional version constraint",
  statement:
    "An extension reference shall identify exactly the extension its fully qualified name identifies regardless of any appended version constraint, and a reference whose appended constraint is not a valid version constraint shall be rejected with guidance naming the version constraint.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "actionable-diagnostics"],
  methods: ["property", "example"],
  derivedFrom: [
    "extension-identity/canonical-names-round-trip",
    "extension-identity/malformed-names-are-rejected",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

// Generators draw from the published identifier grammar, capped below the
// grammar's length limits to keep runs fast. Constraint forms come from the
// accepted version-constraint grammar; the grammar itself is claimed under
// version-constraints.
const ownerArbitrary = FastCheck.stringMatching(/^@[a-z0-9_](?:[a-z0-9_-]{0,18}[a-z0-9_])?$/).map(
  decodeHandleSync,
);
const nameArbitrary = FastCheck.stringMatching(/^[a-z0-9](?:[a-z0-9-]{0,18}[a-z0-9])?$/).map(
  decodeExtensionNameSync,
);
const typeArbitrary = FastCheck.constantFrom(...extensionTypes);
const constraintArbitrary = FastCheck.constantFrom(
  "1.2.3",
  "^1.0.0",
  "~2.4",
  ">=1.0.0",
  "1.x",
  "*",
);

const decodeReference = Schema.decodeUnknownEffect(ExtensionSpecSchema);

describe("Extension references", () => {
  it.effect.prop(
    "appending any version constraint to a name never changes which extension it identifies",
    {
      owner: ownerArbitrary,
      type: typeArbitrary,
      name: nameArbitrary,
      constraint: constraintArbitrary,
    },
    ({ owner, type, name, constraint }) =>
      Effect.sync(() => {
        const fqn = formatFqn({ owner, type, name });
        const plain = parseExtensionFqnParts(fqn);
        expect(plain).toBeDefined();
        expect(parseExtensionSpecParts(`${fqn}@${constraint}`)).toEqual(plain);
      }),
    { fastCheck: { numRuns: 150 } },
  );

  it.effect("a version-constrained reference identifies the same extension as its plain name", () =>
    Effect.sync(() => {
      const plain = parseExtensionFqnParts("@acme/skills/code-review");
      expect(plain).toBeDefined();
      expect(parseExtensionSpecParts("@acme/skills/code-review@^1.0.0")).toEqual(plain);
    }),
  );

  it.effect.each([
    { reference: "@acme/skills/code-review", form: "a plain name" },
    { reference: "@acme/skills/code-review@^1.0.0", form: "a name with a caret constraint" },
  ] as const)("accepts $form as written", ({ reference }) =>
    Effect.gen(function* () {
      expect(yield* decodeReference(reference)).toBe(reference);
    }),
  );

  it.effect("a reference with an invalid version constraint is rejected with guidance", () =>
    Effect.gen(function* () {
      const failure = yield* decodeReference("@acme/skills/code-review@banana").pipe(Effect.flip);
      expect(String(failure)).toContain("version constraint");
    }),
  );
});
