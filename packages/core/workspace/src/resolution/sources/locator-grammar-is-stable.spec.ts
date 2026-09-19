/** Requirement: source-resolution/locator-grammar-is-stable. */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { fc as FastCheck } from "@fast-check/vitest";
import { describe, expect, it } from "@effect/vitest";

import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import { defineSpecification } from "@agentxm/specification-metadata";
import { resolveSource } from "./resolve-source.js";
import { WorkspaceCatalogTest } from "./testing.js";

export const specification = defineSpecification({
  requirement: "source-resolution/locator-grammar-is-stable",
  title: "Hosted Git syntax expands to self-describing Git locators",
  statement:
    "Hosted Git shorthand and browser URLs shall expand to one self-describing Git locator; HTTPS, SSH, Git, and SCP clone addresses shall require no host configuration; registry aliases alone shall remain configured sources.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "trustworthy-distribution"],
  methods: ["decision-table", "property", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  limitations: [
    {
      limitation:
        "This grammar specification proves expansion and classification without contacting a Git remote.",
      retirementCondition:
        "The CLI end-to-end suite exercises each transport against controlled Git remotes.",
    },
  ],
  openQuestions: [],
});

const registry = {
  type: "registry" as const,
  name: "agentxm",
  location: new URL("https://registry.example.com"),
};

const OfflineHttp = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, new Response("offline", { status: 503 }))),
  ),
);

const TestLayer = Layer.mergeAll(
  WorkspaceCatalogTest({ sources: [registry] }),
  OfflineHttp,
  NodeServices.layer,
);

const resolve = (input: string) => resolveSource(input).pipe(Effect.provide(TestLayer));

type Projection =
  | {
      readonly family: "git";
      readonly url: string;
      readonly revision: string | null;
      readonly path: string | null;
    }
  | { readonly family: "path"; readonly path: string }
  | { readonly family: "registry"; readonly url: string; readonly owner: string | null }
  | { readonly family: "workspace" };

const project = (source: Source): Projection => {
  switch (source.type) {
    case "git":
      return {
        family: "git",
        url: source.url.href,
        revision: Option.getOrNull(source.ref),
        path: Option.getOrNull(source.subPath),
      };
    case "local":
      return { family: "path", path: source.path };
    case "registry":
      return {
        family: "registry",
        url: source.location.href,
        owner: Option.getOrNull(source.owner),
      };
    case "workspace":
      return { family: "workspace" };
  }
};

const cases: ReadonlyArray<{
  readonly label: string;
  readonly input: string;
  readonly expected: Projection;
}> = [
  {
    label: "bare owner and repository use the built-in GitHub sugar",
    input: "acme/widget",
    expected: {
      family: "git",
      url: "https://github.com/acme/widget.git",
      revision: null,
      path: null,
    },
  },
  {
    label: "bare owner and repository accept a double-slash subpath",
    input: "acme/widget//skills/review",
    expected: {
      family: "git",
      url: "https://github.com/acme/widget.git",
      revision: null,
      path: "skills/review",
    },
  },
  {
    label: "bare owner and repository accept a Git revision",
    input: "acme/widget@v3",
    expected: {
      family: "git",
      url: "https://github.com/acme/widget.git",
      revision: "v3",
      path: null,
    },
  },
  {
    label: "GitHub shorthand keeps a subpath and revision",
    input: "github:acme/widget//skills/review@v3",
    expected: {
      family: "git",
      url: "https://github.com/acme/widget.git",
      revision: "v3",
      path: "skills/review",
    },
  },
  {
    label: "GitLab shorthand preserves subgroup owners",
    input: "gitlab:acme/platform/widget//skills/review@main",
    expected: {
      family: "git",
      url: "https://gitlab.com/acme/platform/widget.git",
      revision: "main",
      path: "skills/review",
    },
  },
  {
    label: "Bitbucket shorthand expands to its clone URL",
    input: "bitbucket:acme/widget",
    expected: {
      family: "git",
      url: "https://bitbucket.org/acme/widget.git",
      revision: null,
      path: null,
    },
  },
  {
    label: "Azure Repos shorthand is built in",
    input: "azurerepos:acme/platform/widget//skills/review@main",
    expected: {
      family: "git",
      url: "https://dev.azure.com/acme/platform/_git/widget",
      revision: "main",
      path: "skills/review",
    },
  },
  {
    label: "GitHub browser tree URLs expand before acquisition",
    input: "https://github.com/acme/widget/tree/v3/skills/review",
    expected: {
      family: "git",
      url: "https://github.com/acme/widget.git",
      revision: "v3",
      path: "skills/review",
    },
  },
  {
    label: "unknown browser URLs fall back to clone URLs without configuration",
    input: "https://git.corp/acme/widget",
    expected: {
      family: "git",
      url: "https://git.corp/acme/widget",
      revision: null,
      path: null,
    },
  },
  {
    label: "HTTPS clone URLs accept an optional Git suffix",
    input: "https://git.corp/acme/widget.git#release",
    expected: {
      family: "git",
      url: "https://git.corp/acme/widget.git",
      revision: "release",
      path: null,
    },
  },
  {
    label: "SSH clone URLs require no host configuration",
    input: "ssh://git@git.corp/acme/widget.git#release",
    expected: {
      family: "git",
      url: "ssh://git@git.corp/acme/widget.git",
      revision: "release",
      path: null,
    },
  },
  {
    label: "Git protocol clone URLs require no host configuration",
    input: "git://git.corp/acme/widget",
    expected: {
      family: "git",
      url: "git://git.corp/acme/widget",
      revision: null,
      path: null,
    },
  },
  {
    label: "SCP addresses retain SSH acquisition semantics",
    input: "git@git.corp:acme/widget.git#release",
    expected: {
      family: "git",
      url: "ssh://git@git.corp/acme/widget.git",
      revision: "release",
      path: null,
    },
  },
  {
    label: "relative paths remain path sources",
    input: "./skills/review",
    expected: { family: "path", path: "./skills/review" },
  },
  {
    label: "registry FQNs use their configured registry",
    input: "@acme/skills/review",
    expected: {
      family: "registry",
      url: "https://registry.example.com/",
      owner: "@acme",
    },
  },
];

describe("source locator decision table", () => {
  it.effect.each(cases)("$label", ({ input, expected }) =>
    Effect.gen(function* () {
      expect(project(yield* resolve(input))).toEqual(expected);
    }),
  );

  it.effect("rejects protocols outside the clone-URL contract", () =>
    Effect.gen(function* () {
      const failure = yield* resolve("http://git.corp/acme/widget.git").pipe(Effect.flip);
      expect(failure._tag).toBe("SourceSyntaxInvalid");
    }),
  );

  it.effect("rejects traversing repository subpaths", () =>
    Effect.gen(function* () {
      const failure = yield* resolve("acme/widget//../secret").pipe(Effect.flip);
      expect(failure._tag).toBe("SourceSyntaxInvalid");
    }),
  );

  const segment = FastCheck.stringMatching(/^[a-z0-9](?:[a-z0-9-]{0,11}[a-z0-9])?$/);
  const bareCoordinates = FastCheck.sample(FastCheck.record({ owner: segment, repo: segment }), 25);
  it.effect("every sampled bare owner/repository pair expands deterministically", () =>
    Effect.forEach(
      bareCoordinates,
      ({ owner, repo }) =>
        Effect.gen(function* () {
          expect(project(yield* resolve(`${owner}/${repo}`))).toEqual({
            family: "git",
            url: `https://github.com/${owner}/${repo}.git`,
            revision: null,
            path: null,
          });
        }),
      { discard: true },
    ),
  );
});
