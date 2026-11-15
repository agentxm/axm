import { createHash } from "node:crypto";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as HttpClient from "effect/http/HttpClient";

import { defineSpecification } from "@agentxm/specification-metadata";

import { captureHelpDocForArgs } from "../../test-support/command-tree-test-helpers.js";
import { probeFlags, runInvocation } from "../../test-support/parser-probe.js";
import { selectReleaseVerification, type VerifySelectionArgs } from "./command.js";

export const specification = defineSpecification({
  requirement: "cli/verify/selection-is-exact-and-explicit",
  title: "Verify selects only exact releases or one publish result",
  statement:
    "Verify shall select releases only from exact versioned references or from one publish result, accept an expected integrity only with a single exact reference, show contextual usage when nothing is selected, and refuse a range, tag, bare name, unknown type or mixed selection as a usage error before any Registry request.",
  class: "functional",
  role: "interface",
  goals: ["trustworthy-distribution", "machine-automation", "actionable-diagnostics"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const sri = (label: string, algorithm: "sha512" | "sha256" = "sha512") =>
  `sha512-${createHash(algorithm).update(label).digest("base64")}`;
const integrity = sri("review-1.2.0");
const review = "@acme/skills/review@1.2.0";

const args = (
  input: Partial<{
    readonly extension: ReadonlyArray<string>;
    readonly integrity: string;
    readonly publishResult: string;
  }>,
): VerifySelectionArgs => ({
  extension: input.extension ?? [],
  integrity: Option.fromUndefinedOr(input.integrity),
  publishResult: Option.fromUndefinedOr(input.publishResult),
});

/**
 * Record every file-system read and every Registry request an invocation
 * makes. The observed file system holds nothing and refuses every access, so
 * no example reads or writes native state: an invocation that gets past
 * selection reaches the runtime, whose first access is recorded and refused.
 */
const observedInvocation = (argv: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const reads: Array<string> = [];
    const requests: Array<string> = [];
    const httpClient = HttpClient.make((request) => {
      requests.push(`${request.method} ${request.url}`);
      return Effect.die(new Error(`Unexpected Registry request ${request.url}`));
    });
    const empty = FileSystem.makeNoop({});
    const record = (path: string) => Effect.sync(() => void reads.push(path));
    const fileSystemLayer = Layer.succeed(
      FileSystem.FileSystem,
      FileSystem.makeNoop({
        access: (path, options) => record(path).pipe(Effect.andThen(empty.access(path, options))),
        exists: (path) => record(path).pipe(Effect.andThen(empty.exists(path))),
        glob: (pattern, options) =>
          record(pattern).pipe(Effect.andThen(empty.glob(pattern, options))),
        lstat: (path) => record(path).pipe(Effect.andThen(empty.lstat(path))),
        open: (path, options) => record(path).pipe(Effect.andThen(empty.open(path, options))),
        readDirectory: (path, options) =>
          record(path).pipe(Effect.andThen(empty.readDirectory(path, options))),
        readFile: (path) => record(path).pipe(Effect.andThen(empty.readFile(path))),
        readFileString: (path, encoding) =>
          record(path).pipe(Effect.andThen(empty.readFileString(path, encoding))),
        readLink: (path) => record(path).pipe(Effect.andThen(empty.readLink(path))),
        realPath: (path) => record(path).pipe(Effect.andThen(empty.realPath(path))),
        stat: (path) => record(path).pipe(Effect.andThen(empty.stat(path))),
      }),
    );
    const outcome = yield* runInvocation(argv, { httpClient, fileSystemLayer });
    return { outcome, reads, requests };
  });

describe("Exact and explicit release verification selection", () => {
  it.effect("exposes one root route with references, an expectation and a publish result", () =>
    Effect.gen(function* () {
      const help = yield* captureHelpDocForArgs(["verify"]);
      expect(help.usage).toContain("axm verify");
      expect(
        yield* probeFlags(
          ["verify"],
          ["--integrity", integrity, "--publish-result", "publish.json", "--registry", "agentxm"],
        ),
      ).toBe("accepted");
    }),
  );

  it.effect.each([
    { flag: "--preview", argv: ["--preview"] },
    { flag: "--yes", argv: ["--yes"] },
    { flag: "--checks", argv: ["--checks", "all"] },
  ])("registers no $flag flag", ({ argv }) =>
    Effect.gen(function* () {
      expect(yield* probeFlags(["verify"], argv)).toBe("unrecognized");
    }),
  );

  it.effect.each([
    {
      selection: "one exact reference",
      input: args({ extension: [review] }),
      expected: {
        mode: "references",
        references: [{ id: review, input: review, type: "skill", version: "1.2.0" }],
      },
    },
    {
      selection: "the same release named twice",
      input: args({ extension: [review, review] }),
      expected: {
        mode: "references",
        references: [{ id: review }, { id: review }],
      },
    },
    {
      selection: "one exact reference with its expected integrity",
      input: args({ extension: [review], integrity }),
      expected: { mode: "references", references: [{ id: review }] },
    },
    {
      selection: "one publish result, kept as given for the execution directory",
      input: args({ publishResult: "out/publish.json" }),
      expected: { mode: "publish-result", path: "out/publish.json" },
    },
  ])("selects $selection", ({ input, expected }) =>
    Effect.gen(function* () {
      // No workspace, file system or Registry service is provided at this boundary.
      const selection = yield* selectReleaseVerification(input);
      expect(selection).toMatchObject(expected);
      if (selection.mode === "references") expect(selection.integrity).toEqual(input.integrity);
    }),
  );

  it.effect("shows contextual usage, without domain work, when nothing is selected", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(selectReleaseVerification(args({})));
      expect(failure).toMatchObject({
        _tag: "ShowHelp",
        commandPath: ["axm", "verify"],
        errors: [],
      });
    }),
  );

  it.effect.each([
    {
      selection: "references together with a publish result",
      input: args({ extension: [review], publishResult: "publish.json" }),
      names: "--publish-result",
    },
    {
      selection: "an expected integrity with a publish result",
      input: args({ publishResult: "publish.json", integrity }),
      names: "--integrity",
    },
    {
      selection: "an expected integrity without a reference",
      input: args({ integrity }),
      names: "--integrity",
    },
    {
      selection: "an expected integrity for two references to the same release",
      input: args({ extension: [review, review], integrity }),
      names: "--integrity",
    },
    {
      selection: "an expected integrity for two releases",
      input: args({ extension: [review, "@acme/packs/engineering@2.0.0"], integrity }),
      names: "--integrity",
    },
    {
      selection: "an expected integrity that is not SRI",
      input: args({ extension: [review], integrity: "deadbeef" }),
      names: "deadbeef",
    },
    {
      selection: "an expected integrity of another digest length",
      input: args({ extension: [review], integrity: sri("review", "sha256") }),
      names: sri("review", "sha256"),
    },
    {
      selection: "an expected integrity of another algorithm",
      input: args({
        extension: [review],
        integrity: `sha256-${createHash("sha256").update("review").digest("base64")}`,
      }),
      names: "sha256-",
    },
    {
      selection: "a version range",
      input: args({ extension: ["@acme/skills/review@^1.2.0"] }),
      names: "@acme/skills/review@^1.2.0",
    },
    {
      selection: "a tag",
      input: args({ extension: ["@acme/skills/review@latest"] }),
      names: "@acme/skills/review@latest",
    },
    {
      selection: "a reference without a version",
      input: args({ extension: ["@acme/skills/review"] }),
      names: "@acme/skills/review",
    },
    {
      selection: "a bare name",
      input: args({ extension: ["review@1.2.0"] }),
      names: "review@1.2.0",
    },
    {
      selection: "an unknown plural type",
      input: args({ extension: ["@acme/widgets/review@1.2.0"] }),
      names: "@acme/widgets/review@1.2.0",
    },
    {
      selection: "a glob beside an exact reference",
      input: args({ extension: [review, "@acme/skills/*@1.2.0"] }),
      names: "@acme/skills/*@1.2.0",
    },
  ])("refuses $selection as a usage error naming the input", ({ input, names }) =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(selectReleaseVerification(input));
      expect(failure).toMatchObject({ code: "usage", detail: expect.stringContaining(names) });
    }),
  );

  it.effect.each([
    { refusal: "no selection", argv: ["verify"], expected: { _tag: "ShowHelp", errors: [] } },
    {
      refusal: "a version range",
      argv: ["verify", "@acme/skills/review@^1.2.0"],
      expected: { code: "usage" },
    },
    {
      refusal: "references with a publish result",
      argv: ["verify", review, "--publish-result", "publish.json"],
      expected: { code: "usage" },
    },
    {
      refusal: "an expected integrity for two references",
      argv: ["verify", review, "@acme/skills/format@1.0.0", "--integrity", integrity],
      expected: { code: "usage" },
    },
  ])(
    "through the command parser, $refusal makes no Registry request and reads no file",
    ({ argv, expected }) =>
      Effect.gen(function* () {
        const { outcome, reads, requests } = yield* observedInvocation(argv);
        expect(Result.isFailure(outcome) && outcome.failure).toMatchObject(expected);
        expect(requests).toEqual([]);
        expect(reads).toEqual([]);
      }),
  );

  it.effect(
    "an admitted selection enters the runtime, whose file access the observation records",
    () =>
      Effect.gen(function* () {
        const { outcome, reads } = yield* observedInvocation([
          "verify",
          "--publish-result",
          "missing.json",
        ]);
        // The runtime resolves the execution directory before any domain work,
        // so the observation that saw nothing above would see a refusal that ran.
        expect(reads).toContain(process.cwd());
        expect(Result.isFailure(outcome) && outcome.failure).toMatchObject({
          code: "usage",
          detail: expect.stringContaining("Could not run from the selected directory"),
        });
      }),
  );
});
