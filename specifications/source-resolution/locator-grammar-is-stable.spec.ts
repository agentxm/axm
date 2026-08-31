import * as Effect from "effect/Effect";
import * as FastCheck from "effect/testing/FastCheck";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { resolveSource } from "@agentxm/extension-management/unstable/source-resolution";
import { parseInputPattern, type Source } from "@agentxm/extension-management/unstable/sources";
import { getAppError } from "axm.sh/specification-harness";

import { defineSpecification } from "../support/contract.js";
import { makeSpecWorkspace } from "../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "source-resolution/locator-grammar-is-stable",
  title: "Source locators resolve through a stable grammar and configured hosts",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "trustworthy-distribution"],
  methods: ["decision-table", "property", "example"],
});

/**
 * Product-observable projection of a resolved source: which host serves it
 * and which coordinates were understood — never resolver internals.
 */
type LocatorProjection =
  | {
      readonly kind: "github" | "gitlab" | "bitbucket";
      readonly host: string;
      readonly owner: string;
      readonly repo: string;
      readonly ref: string | null;
      readonly subPath: string | null;
    }
  | { readonly kind: "git"; readonly cloneUrl: string; readonly ref: string | null }
  | { readonly kind: "local"; readonly path: string }
  | { readonly kind: "registry"; readonly registry: string; readonly host: string }
  | { readonly kind: "azurerepos" | "workspace" };

const describeSource = (source: Source): LocatorProjection => {
  switch (source.type) {
    case "github":
    case "gitlab":
    case "bitbucket":
      return {
        kind: source.type,
        host: source.url.host,
        owner: source.owner,
        repo: source.repo,
        ref: Option.getOrNull(source.ref),
        subPath: Option.getOrNull(source.subPath),
      };
    case "git":
      return {
        kind: "git",
        cloneUrl: source.url.href,
        ref: Option.getOrNull(source.ref),
      };
    case "local":
      return { kind: "local", path: source.path };
    case "registry":
      return { kind: "registry", registry: source.name, host: source.location.host };
    case "azurerepos":
      return { kind: "azurerepos" };
    case "workspace":
      return { kind: "workspace" };
  }
};

describe("Source locator grammar", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** Default hosts plus one configured registry named `agentxm`. */
  const makeGrammarWorkspace = (
    sources: ReadonlyArray<unknown> = [
      { type: "registry", name: "agentxm", location: "https://registry.example.com" },
    ],
  ) => {
    const workspace = makeSpecWorkspace({ settings: { sources } });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  const resolveWith = (input: string) => {
    const workspace = makeGrammarWorkspace();
    return resolveSource(input).pipe(Effect.provide(workspace.layer));
  };

  const acceptedCases: ReadonlyArray<{
    readonly label: string;
    readonly input: string;
    readonly expected: LocatorProjection;
  }> = [
    {
      label: "provider shorthand names owner and repository",
      input: "github:owner/repo",
      expected: {
        kind: "github",
        host: "github.com",
        owner: "owner",
        repo: "repo",
        ref: null,
        subPath: null,
      },
    },
    {
      label: "double-slash subpath and a final @ref",
      input: "github:owner/repo//skills/my-skill@v1.0.0",
      expected: {
        kind: "github",
        host: "github.com",
        owner: "owner",
        repo: "repo",
        ref: "v1.0.0",
        subPath: "skills/my-skill",
      },
    },
    {
      label: "a slash-containing @segment stays in the subpath because refs cannot contain a slash",
      input: "github:agentxm/community//agent_extensions/@community/mcps/linear",
      expected: {
        kind: "github",
        host: "github.com",
        owner: "agentxm",
        repo: "community",
        ref: null,
        subPath: "agent_extensions/@community/mcps/linear",
      },
    },
    {
      label: "gitlab shorthand keeps subgroup namespaces",
      input: "gitlab:group/subgroup/repo//packages/tool@main",
      expected: {
        kind: "gitlab",
        host: "gitlab.com",
        owner: "group/subgroup",
        repo: "repo",
        ref: "main",
        subPath: "packages/tool",
      },
    },
    {
      label: "bitbucket shorthand resolves through its built-in host",
      input: "bitbucket:owner/repo",
      expected: {
        kind: "bitbucket",
        host: "bitbucket.org",
        owner: "owner",
        repo: "repo",
        ref: null,
        subPath: null,
      },
    },
    {
      label: "a relative path is a local source, preserved verbatim",
      input: "./my-skill",
      expected: { kind: "local", path: "./my-skill" },
    },
    {
      label: "an absolute path is a local source, preserved verbatim",
      input: "/home/user/skills/my-skill",
      expected: { kind: "local", path: "/home/user/skills/my-skill" },
    },
    {
      label: "a repository URL routes to the configured host by hostname",
      input: "https://github.com/owner/repo",
      expected: {
        kind: "github",
        host: "github.com",
        owner: "owner",
        repo: "repo",
        ref: null,
        subPath: null,
      },
    },
    {
      label: "an SCP address with a configured host resolves to that host with its fragment as ref",
      input: "git@github.com:owner/repo.git#main",
      expected: {
        kind: "github",
        host: "github.com",
        owner: "owner",
        repo: "repo",
        ref: "main",
        subPath: null,
      },
    },
    {
      label: "an SCP address with an unknown host passes through as a generic git source",
      input: "git@example.com:owner/repo.git",
      expected: {
        kind: "git",
        cloneUrl: "ssh://git@example.com/owner/repo.git",
        ref: null,
      },
    },
    {
      label: "a git URL fragment becomes the ref and is stripped from the clone URL",
      input: "ssh://git@example.com/owner/repo.git#release",
      expected: {
        kind: "git",
        cloneUrl: "ssh://git@example.com/owner/repo.git",
        ref: "release",
      },
    },
    {
      label: "a namespaced registry pattern routes to the configured registry",
      input: "@acme/skills/my-skill",
      expected: { kind: "registry", registry: "agentxm", host: "registry.example.com" },
    },
  ];

  it.effect.each(acceptedCases)("$label", (testCase) =>
    Effect.gen(function* () {
      const resolved = yield* resolveWith(testCase.input);
      expect(describeSource(resolved)).toEqual(testCase.expected);
    }),
  );

  const rejectedCases = [
    { label: "a subpath traversing outside the repository", input: "github:owner/repo//../src" },
    { label: "an unknown shorthand prefix", input: "unknown:owner/repo" },
    { label: "a shorthand without owner and repository", input: "github:invalid" },
    {
      label: "a repository URL whose host matches no configured source",
      input: "https://github.example.org/owner/repo",
    },
    { label: "empty input", input: "   " },
  ];

  it.effect.each(rejectedCases)("rejects $label with a typed failure", (testCase) =>
    Effect.gen(function* () {
      const failure = yield* resolveWith(testCase.input).pipe(Effect.flip);
      const error = getAppError(failure);
      expect(error.detail.length).toBeGreaterThan(0);
    }),
  );

  it.effect("a project-defined source of the same name overrides the built-in host", () =>
    Effect.gen(function* () {
      const workspace = makeGrammarWorkspace([
        { type: "github", name: "github", url: "https://github.example.com" },
      ]);
      const resolved = yield* resolveSource("github:owner/repo").pipe(
        Effect.provide(workspace.layer),
      );
      expect(describeSource(resolved)).toEqual({
        kind: "github",
        host: "github.example.com",
        owner: "owner",
        repo: "repo",
        ref: null,
        subPath: null,
      });
    }),
  );

  const segment = FastCheck.stringMatching(/^[a-z0-9][a-z0-9-]{0,12}$/);
  const slashFreeRef = FastCheck.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,12}$/);

  it.effect.prop(
    "every well-formed provider shorthand resolves to exactly its stated coordinates",
    [segment, segment, segment, segment, slashFreeRef],
    ([owner, repo, first, second, ref]) =>
      Effect.gen(function* () {
        const resolved = yield* resolveWith(`github:${owner}/${repo}//${first}/${second}@${ref}`);
        expect(describeSource(resolved)).toEqual({
          kind: "github",
          host: "github.com",
          owner,
          repo,
          ref,
          subPath: `${first}/${second}`,
        });
      }),
    { fastCheck: { numRuns: 25 } },
  );

  it.effect.prop(
    "every path-prefixed input stays a local source with its path preserved",
    [FastCheck.constantFrom("./", "../", "/"), segment, segment],
    ([prefix, first, second]) =>
      Effect.gen(function* () {
        const input = `${prefix}${first}/${second}`;
        const resolved = yield* resolveWith(input);
        expect(describeSource(resolved)).toEqual({ kind: "local", path: input });
      }),
    { fastCheck: { numRuns: 25 } },
  );

  const classificationCases = [
    { label: "a bare name", input: "code-review", pattern: "name-input" },
    {
      label: "a registry pattern",
      input: "@acme/skills/code-review",
      pattern: "registry-pattern-input",
    },
    {
      label: "an intrinsic workspace locator",
      input: "workspace:@acme/skills/code-review",
      pattern: "workspace-pattern-input",
    },
    { label: "a glob", input: "effect-*", pattern: "glob-input" },
  ];

  it.effect.each(classificationCases)("classifies $label", (testCase) =>
    Effect.sync(() => {
      const parsed = parseInputPattern(testCase.input);
      expect(Option.isSome(parsed)).toBe(true);
      if (Option.isSome(parsed)) {
        expect(parsed.value.pattern.pattern).toBe(testCase.pattern);
        expect(parsed.value.originalInput).toBe(testCase.input);
      }
    }),
  );

  it.effect("input outside the grammar is not classified", () =>
    Effect.sync(() => {
      expect(Option.isNone(parseInputPattern("###"))).toBe(true);
      expect(Option.isNone(parseInputPattern(""))).toBe(true);
    }),
  );
});
