import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { handleView } from "axm.sh/specification-harness";
import {
  makePublicReadSpecContext,
  readRegistry,
  readExtensionIndex,
} from "../../support/read-harness.js";

export const specification = defineSpecification({
  requirement: "cli/view/public-metadata-requires-no-management-access",
  title: "Public metadata can be viewed without management access",
  statement:
    "When viewing public extension metadata through the default Registry, AXM shall complete the read without a workspace, credentials, or a protected visibility-management request.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/view/handler.internal.test.ts",
    "packages/cli/src/root/view/handler.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Anonymous public view", () => {
  it.effect("reads a public index without a workspace service", () => {
    const context = makePublicReadSpecContext(() => ({ body: readExtensionIndex }));
    return context.provide(
      Effect.gen(function* () {
        yield* handleView({
          handle: "@acme/skills/review",
          field: Option.none(),
          registry: Option.none(),
        });
        expect(context.rendererState.results.at(-1)?.data).toMatchObject({
          handle: "@acme/skills/review",
          visibility: "public",
        });
        expect(context.requests).toHaveLength(1);
        expect(context.requests[0]).toMatchObject({
          method: "GET",
          url: `${readRegistry}/v1/extensions/@acme/skills/review`,
          hasAuthorization: false,
        });
      }),
    );
  });
});
