import * as Effect from "effect/Effect";
import * as FastCheck from "effect/testing/FastCheck";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { ExtensionSpecSchema } from "@agentxm/client-core/unstable/extensions/common";
import { parseFqn } from "@agentxm/client-core/unstable/extensions/fqn";

import { defineSpecification } from "../../support/contract.js";

export const specification = defineSpecification({
  requirement: "client-core/extension-identity/malformed-names-are-rejected",
  title: "A malformed extension name is rejected with a typed failure naming the input",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["decision-table", "property", "example"],
});

/** Bare names: plausible identifiers that are not fully qualified names. */
const bareNameArbitrary = FastCheck.stringMatching(/^[a-z][a-z0-9-]{0,30}$/);

const decodeSpec = Schema.decodeUnknownEffect(ExtensionSpecSchema);

describe("Malformed extension names", () => {
  it.effect.each([
    { input: "@acme/code-review", reason: "two segments instead of three" },
    { input: "acme/skills/code-review", reason: "an owner missing the @ prefix" },
    { input: "@acme/widgets/tool", reason: "an unknown extension type" },
    { input: "@acme/skill/tool", reason: "a singular type segment" },
    { input: "@acme/skills/code_review", reason: "an underscore in the extension name" },
    { input: "@acme/skills/-tool", reason: "a name starting with a hyphen" },
    { input: "", reason: "an empty reference" },
    { input: "@acme/skills/", reason: "a missing name" },
    { input: "@acme//code-review", reason: "a missing type segment" },
    { input: "@/skills/code-review", reason: "an empty owner" },
    { input: `@acme/skills/${"a".repeat(65)}`, reason: "a name longer than sixty-four characters" },
  ])("rejects $reason and preserves the offending input", ({ input }) =>
    Effect.sync(() => {
      const result = parseFqn(input);
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure._tag).toBe("FqnInvalidError");
        expect(result.failure.input).toBe(input);
      }
    }),
  );

  it.effect("accepts a name of exactly sixty-four characters", () =>
    Effect.gen(function* () {
      const parsed = yield* Effect.fromResult(parseFqn(`@acme/skills/${"a".repeat(64)}`));
      expect(parsed.name).toBe("a".repeat(64));
    }),
  );

  it.effect.prop(
    "no bare name is ever mistaken for a fully qualified name",
    { name: bareNameArbitrary },
    ({ name }) =>
      Effect.sync(() => {
        expect(Result.isFailure(parseFqn(name))).toBe(true);
      }),
    { fastCheck: { numRuns: 100 } },
  );

  it.effect("a reference with an invalid version constraint is rejected with guidance", () =>
    Effect.gen(function* () {
      const failure = yield* decodeSpec("@acme/skills/code-review@banana").pipe(Effect.flip);
      expect(String(failure)).toContain("version constraint");
    }),
  );
});
