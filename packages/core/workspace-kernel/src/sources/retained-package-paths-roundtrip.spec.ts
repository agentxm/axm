import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import { routeUrlInput } from "./index.js";

export const specification = defineSpecification({
  requirement: "sources/git/retained-package-paths-roundtrip",
  title: "Generic Git source locators retain selected package paths and revisions",
  statement:
    "AXM shall preserve a selected repository-relative package path and requested revision when serializing and resolving a Git source hosted outside the built-in forge grammars. It shall reject malformed or escaping package selectors before acquisition.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "trustworthy-distribution"],
  boundary: "platform",
  boundaryRationale:
    "The public source parser and printer determine the identity passed to acquisition.",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Generic Git package selectors", () => {
  it.effect.each([
    { path: "plugins/review", ref: undefined },
    { path: "plugins/review", ref: "feature/source-paths" },
    { path: "plugins/review + more", ref: "feature/one&two" },
    { path: "plugins/équipe", ref: "v1.0.0" },
  ])("roundtrips $path at $ref", ({ path, ref }) =>
    Effect.gen(function* () {
      const input = {
        type: "git",
        url: new URL("git://git.example.test/collection.git"),
        subPath: Option.some(path),
        ref: Option.fromUndefinedOr(ref),
      } as const;
      const printed = printSourceParams(input);
      const resolved = yield* routeUrlInput(new URL(printed), printed);
      expect(resolved).toEqual(input);
    }),
  );
  it.effect.each([
    "path=../escape",
    "path=/absolute",
    "path=C%3A%2Fescape",
    "path=",
    "path=a&path=b",
    "path=a&extra=b",
  ])("rejects malformed bounded selector %s", (query) =>
    Effect.gen(function* () {
      const input = `git://git.example.test/collection.git#axm:${query}`;
      expect(yield* routeUrlInput(new URL(input), input).pipe(Effect.result)).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "SourceSyntaxInvalid" },
      });
    }),
  );
});
