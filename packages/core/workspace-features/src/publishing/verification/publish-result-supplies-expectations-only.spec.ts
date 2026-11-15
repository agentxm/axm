import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { testRegistryUrl } from "@agentxm/registry-client/testing";

import { VerifyPublishedReleases } from "../index.js";
import { expectPublishRefused } from "../test-helpers.js";
import {
  digestOf,
  makeMemoryWorld,
  publishResult,
  publishResultRequest,
  savedBareResult,
  savedEnvelope,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/verify/publish-result-supplies-expectations-only",
  title: "A publish result supplies the verified set and its expected integrity only",
  statement:
    "When given a publish result, verify shall take the admitted publication set as its selection, each prepared archive integrity as that release's caller-supplied expectation and, when no Registry is named, the recorded Registry as the one to read, verify a release the result lists more than once only once when its entries agree, report identity as not applicable for a release the result did not prepare, carry reported status and settlement only as reported input, and refuse a document with another contract, without an admitted set, without a usable Registry or whose entries for one release disagree before any Registry request.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "machine-automation", "safe-repetition"],
  boundary: "memory",
  boundaryRationale:
    "Saved documents are read from an in-memory file system and the Registry is a recording port; the production Registry client and the compiled command reading a file from disk need separate evidence.",
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Whether a publication-set item whose id disagrees with its owner, type and name should be refused is undecided.",
  ],
});

const path = "/work/publish.json";
const uploaded = digestOf("review-1.2.0");
const existing = digestOf("format-2.0.0");
const catalog = {
  "@acme/skills/review": [{ version: "1.2.0", integrity: uploaded }],
  "@acme/skills/format": [{ version: "2.0.0", integrity: existing }],
};
const twoReleases = publishResult([
  { name: "review", version: "1.2.0", prepared: uploaded, settlement: "response" },
  { name: "format", version: "2.0.0" },
]);

describe("Publish result as verification input", () => {
  it.effect.each([
    { form: "saved envelope", saved: savedEnvelope(twoReleases) },
    { form: "bare result", saved: savedBareResult(twoReleases) },
  ])("verifies the admitted set of a $form against the recorded Registry", ({ saved }) =>
    Effect.gen(function* () {
      const world = makeMemoryWorld({ extensions: catalog, files: { [path]: saved } });
      const document = yield* world.provide(
        VerifyPublishedReleases.verify(publishResultRequest(path)),
      );
      expect(document.registry).toEqual({
        name: "agentxm",
        endpoint: testRegistryUrl,
        selectedBy: "publish-result",
      });
      expect(document.selection).toEqual({
        mode: "publish-result",
        requests: [
          { id: "request-1", input: "@acme/skills/review" },
          { id: "request-2", input: "@acme/skills/format" },
        ],
      });
      const [review, format] = document.releases;
      expect(review).toMatchObject({
        id: "@acme/skills/review@1.2.0",
        requestRefs: ["request-1"],
        expectation: { integrity: uploaded, source: "publish-result" },
        reported: {
          participation: "publish",
          action: "publish",
          status: "success",
          settlement: "response",
        },
        identity: { coverage: { state: "complete" }, conclusion: "satisfied" },
      });
      expect(format).toMatchObject({
        id: "@acme/skills/format@2.0.0",
        reported: {
          participation: "verified-existing",
          action: "skip",
          status: "success",
        },
        identity: {
          coverage: {
            state: "not-applicable",
            reason: "The publish result records no prepared archive.",
          },
          conclusion: "not-applicable",
        },
      });
      expect(format?.expectation).toBeUndefined();
      expect(document.verdict.ok).toBe(true);
      // Presence and archive for both releases; no upload, settlement or readback.
      expect(world.registryCalls()).toEqual([
        {
          operation: "selectMany",
          subjects: ["@acme/skills/review", "@acme/skills/format"],
        },
        {
          operation: "withAccessibleContent",
          subjects: ["@acme/skills/review@1.2.0", "@acme/skills/format@2.0.0"],
        },
        { operation: "read", subjects: ["@acme/skills/review@1.2.0"] },
        { operation: "read", subjects: ["@acme/skills/format@2.0.0"] },
      ]);
    }),
  );

  it.effect(
    "verifies the admitted set of a saved preview, taking each prepared archive as an expectation",
    () =>
      Effect.gen(function* () {
        const preview = publishResult(
          [
            { name: "review", version: "1.2.0", prepared: uploaded },
            { name: "format", version: "2.0.0" },
          ],
          { mode: "preview" },
        );
        expect(JSON.parse(savedEnvelope(preview))).toMatchObject({
          mode: "preview",
          result: { execution: { status: "not-run" } },
        });
        const world = makeMemoryWorld({
          extensions: catalog,
          files: { [path]: savedEnvelope(preview) },
        });
        const document = yield* world.provide(
          VerifyPublishedReleases.verify(publishResultRequest(path)),
        );
        expect(document.registry.selectedBy).toBe("publish-result");
        expect(document.selection.requests.map(({ input }) => input)).toEqual([
          "@acme/skills/review",
          "@acme/skills/format",
        ]);
        const [review, format] = document.releases;
        expect(review).toMatchObject({
          expectation: { integrity: uploaded, source: "publish-result" },
          reported: { participation: "publish", action: "publish", status: "pending" },
          identity: { coverage: { state: "complete" }, conclusion: "satisfied" },
        });
        expect(review?.reported?.settlement).toBeUndefined();
        expect(format?.expectation).toBeUndefined();
        expect(format?.identity).toEqual({
          coverage: {
            state: "not-applicable",
            reason: "The publish result records no prepared archive.",
          },
          conclusion: "not-applicable",
        });
        expect(document.verdict.ok).toBe(true);
        expect(world.registryCalls().map((call) => call.operation)).toEqual([
          "selectMany",
          "withAccessibleContent",
          "read",
          "read",
        ]);
      }),
  );

  it.effect(
    "asks for --registry when the result records no Registry, and verifies against a named one",
    () =>
      Effect.gen(function* () {
        const saved = savedEnvelope(
          publishResult([{ name: "review", version: "1.2.0", prepared: uploaded }], {
            registry: "unknown",
          }),
        );
        const world = makeMemoryWorld({ extensions: catalog, files: { [path]: saved } });
        const refusal = expectPublishRefused(
          yield* world
            .provide(VerifyPublishedReleases.verify(publishResultRequest(path)))
            .pipe(Effect.flip),
        );
        expect(refusal.category).toBe("validation");
        expect(refusal.suggestions).toEqual([
          { description: "Name the Registry to verify against with --registry." },
        ]);
        expect(world.calls).toEqual([]);
        const document = yield* world.provide(
          VerifyPublishedReleases.verify(publishResultRequest(path, { registry: testRegistryUrl })),
        );
        expect(document.registry).toMatchObject({ endpoint: testRegistryUrl, selectedBy: "flag" });
        expect(document.releases[0]?.identity.conclusion).toBe("satisfied");
        expect(document.verdict.ok).toBe(true);
      }),
  );

  it.effect(
    "compares the prepared integrity and keeps an unresolved settlement as reported input",
    () =>
      Effect.gen(function* () {
        const recorded = digestOf("review-1.2.0-as-recorded");
        const saved = savedEnvelope(
          publishResult([
            {
              name: "review",
              version: "1.2.0",
              prepared: uploaded,
              status: "unknown",
              settlement: "unresolved",
            },
          ]),
        );
        const world = makeMemoryWorld({
          extensions: { "@acme/skills/review": [{ version: "1.2.0", integrity: recorded }] },
          files: { [path]: saved },
        });
        const document = yield* world.provide(
          VerifyPublishedReleases.verify(publishResultRequest(path)),
        );
        const [release] = document.releases;
        expect(release).toMatchObject({
          reported: { status: "unknown", settlement: "unresolved" },
          expectation: { integrity: uploaded, source: "publish-result" },
          observed: { integrity: recorded },
          presence: { conclusion: "satisfied" },
          identity: { conclusion: "attention-required", finding: "integrity-mismatch" },
          archive: { conclusion: "satisfied" },
        });
        expect(world.registryCalls().map((call) => call.operation)).toEqual([
          "selectMany",
          "withAccessibleContent",
          "read",
        ]);
      }),
  );

  it.effect("reads an explicitly named Registry instead of the recorded one", () =>
    Effect.gen(function* () {
      const saved = savedEnvelope(
        publishResult([{ name: "review", version: "1.2.0", prepared: uploaded }], {
          registry: "elsewhere",
        }),
      );
      const world = makeMemoryWorld({ extensions: catalog, files: { [path]: saved } });
      const document = yield* world.provide(
        VerifyPublishedReleases.verify(publishResultRequest(path, { registry: testRegistryUrl })),
      );
      expect(document.registry.selectedBy).toBe("flag");
      expect(document.verdict.ok).toBe(true);
    }),
  );

  it.effect(
    "verifies a release listed more than once only once, attributing it to every listing",
    () =>
      Effect.gen(function* () {
        const review = { name: "review", version: "1.2.0", prepared: uploaded };
        const saved = savedEnvelope(
          publishResult([
            { ...review, settlement: "response" },
            { name: "format", version: "2.0.0" },
            { ...review, settlement: "response" },
          ]),
        );
        const world = makeMemoryWorld({ extensions: catalog, files: { [path]: saved } });
        const document = yield* world.provide(
          VerifyPublishedReleases.verify(publishResultRequest(path)),
        );
        expect(document.selection.requests).toEqual([
          { id: "request-1", input: "@acme/skills/review" },
          { id: "request-2", input: "@acme/skills/format" },
          { id: "request-3", input: "@acme/skills/review" },
        ]);
        expect(document.releases.map(({ id, requestRefs }) => ({ id, requestRefs }))).toEqual([
          { id: "@acme/skills/review@1.2.0", requestRefs: ["request-1", "request-3"] },
          { id: "@acme/skills/format@2.0.0", requestRefs: ["request-2"] },
        ]);
        expect(document.releases[0]).toMatchObject({
          expectation: { integrity: uploaded, source: "publish-result" },
          reported: { participation: "publish", settlement: "response" },
          identity: { conclusion: "satisfied" },
        });
        expect(document.verdict.ok).toBe(true);
        expect(world.registryCalls()).toEqual([
          {
            operation: "selectMany",
            subjects: ["@acme/skills/review", "@acme/skills/format"],
          },
          {
            operation: "withAccessibleContent",
            subjects: ["@acme/skills/review@1.2.0", "@acme/skills/format@2.0.0"],
          },
          { operation: "read", subjects: ["@acme/skills/review@1.2.0"] },
          { operation: "read", subjects: ["@acme/skills/format@2.0.0"] },
        ]);
      }),
  );

  const listedTwice = (
    first: Parameters<typeof publishResult>[0][number],
    second: Parameters<typeof publishResult>[0][number],
  ) => publishResult([first, { name: "format", version: "2.0.0" }, second]);
  const listedOnce = (result: ReturnType<typeof publishResult>) => ({
    ...result,
    publicationSet: {
      ...result.publicationSet,
      items: result.publicationSet.items.filter(
        (item, index, items) => items.findIndex((other) => other.id === item.id) === index,
      ),
    },
  });

  it.effect.each([
    {
      entries: "two listings whose prepared integrities differ",
      result: listedTwice(
        { name: "review", version: "1.2.0", prepared: uploaded },
        { name: "review", version: "1.2.0", prepared: digestOf("review-1.2.0-elsewhere") },
      ),
    },
    {
      entries: "two listings whose participations differ",
      result: listedTwice(
        { name: "review", version: "1.2.0", prepared: uploaded },
        {
          name: "review",
          version: "1.2.0",
          prepared: uploaded,
          participation: "verified-existing",
        },
      ),
    },
    {
      entries: "one listing whose recorded outcomes differ in settlement",
      result: listedOnce(
        listedTwice(
          { name: "review", version: "1.2.0", prepared: uploaded, settlement: "response" },
          { name: "review", version: "1.2.0", prepared: uploaded, settlement: "unresolved" },
        ),
      ),
    },
    {
      entries: "one listing whose recorded outcomes differ in status",
      result: listedOnce(
        listedTwice(
          { name: "review", version: "1.2.0", prepared: uploaded, status: "success" },
          { name: "review", version: "1.2.0", prepared: uploaded, status: "unknown" },
        ),
      ),
    },
  ])("refuses a release with $entries as invalid before any Registry request", ({ result }) =>
    Effect.gen(function* () {
      const world = makeMemoryWorld({
        extensions: catalog,
        files: { [path]: savedEnvelope(result) },
      });
      const refusal = expectPublishRefused(
        yield* world
          .provide(VerifyPublishedReleases.verify(publishResultRequest(path)))
          .pipe(Effect.flip),
      );
      expect(refusal.category).toBe("validation");
      expect(refusal.detail).toContain("@acme/skills/review@1.2.0");
      expect(refusal.detail).toContain("disagree");
      expect(world.calls).toEqual([]);
    }),
  );

  it.effect.each([
    {
      document: "another contract",
      saved: JSON.stringify({
        ok: true,
        mode: "query",
        outcome: "completed",
        result: { contract: "plan-result-v4" },
      }),
    },
    {
      document: "a blocked publication set",
      saved: savedEnvelope(
        publishResult([{ name: "review", version: "1.2.0", prepared: uploaded }], {
          status: "blocked",
        }),
      ),
    },
    { document: "an admitted set without releases", saved: savedEnvelope(publishResult([])) },
    {
      document: "an error document",
      saved: JSON.stringify({
        ok: false,
        code: "network",
        title: "Network",
        detail: "Unreachable.",
      }),
    },
    { document: "text that is not JSON", saved: "publish finished" },
  ])("refuses $document as invalid before any Registry request", ({ saved }) =>
    Effect.gen(function* () {
      const world = makeMemoryWorld({ extensions: catalog, files: { [path]: saved } });
      const failure = yield* world
        .provide(VerifyPublishedReleases.verify(publishResultRequest(path)))
        .pipe(Effect.flip);
      expect(expectPublishRefused(failure).category).toBe("validation");
      expect(world.calls).toEqual([]);
    }),
  );

  it.effect("refuses an unreadable file before any Registry request", () =>
    Effect.gen(function* () {
      const world = makeMemoryWorld({ extensions: catalog });
      const failure = yield* world
        .provide(VerifyPublishedReleases.verify(publishResultRequest(path)))
        .pipe(Effect.flip);
      expect(expectPublishRefused(failure).category).toBe("validation");
      expect(world.calls).toEqual([]);
    }),
  );

  it.effect("keeps the Registry selection failure for a recorded name not configured here", () =>
    Effect.gen(function* () {
      const saved = savedEnvelope(
        publishResult([{ name: "review", version: "1.2.0", prepared: uploaded }], {
          registry: "elsewhere",
        }),
      );
      const world = makeMemoryWorld({ extensions: catalog, files: { [path]: saved } });
      const failure = yield* world
        .provide(VerifyPublishedReleases.verify(publishResultRequest(path)))
        .pipe(Effect.flip);
      expect(failure).toMatchObject({ _tag: "RegistrySourceUnknown", name: "elsewhere" });
      expect(world.calls).toEqual([]);
    }),
  );
});
