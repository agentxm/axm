import { withDetailedWork, workObservations } from "../../locations/testing.js";
import * as Tracer from "effect/Tracer";
import * as Effect from "effect/Effect";
/**
 * Unit tests for rendered files utilities.
 */

import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { RenderedFilePathSchema, computeSourceHash } from "./rendered-files.js";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";

describe("computeSourceHash", () => {
  it.effect("records exact UTF-8 hash work without constructing summary-mode spans", () =>
    Effect.gen(function* () {
      const observations = workObservations(false);
      const constructed: string[] = [];
      const tracer = Tracer.make({
        span(options) {
          constructed.push(options.name);
          return new Tracer.NativeSpan(options);
        },
      });
      const digest = yield* computeSourceHash("TOKEN=private-α").pipe(
        observations.provide,
        Effect.withTracer(tracer),
      );
      expect(digest).toBe("34568a39677de366617018bde10dc658d1efddf6b29b111291c0a80a26cd7686");
      expect(constructed).toEqual([]);
      expect(observations.facts).toMatchObject([
        {
          kind: "axm.hash.content",
          outcome: "success",
          attributes: { "axm.work.count": 1, "axm.work.bytes": 16 },
        },
      ]);
      expect(JSON.stringify(observations.facts)).not.toContain("private");
    }),
  );

  it.effect.each([
    {
      content: "",
      bytes: 0,
      digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    {
      content: "hello world",
      bytes: 11,
      digest: "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    },
    {
      content: "hello world!",
      bytes: 12,
      digest: "7509e5bda0c762d2bac7f90d758b5b2263fa01ccbc542ab5e3df163be08e6ca9",
    },
    {
      content: "TOKEN=private-α",
      bytes: 16,
      digest: "34568a39677de366617018bde10dc658d1efddf6b29b111291c0a80a26cd7686",
    },
    {
      content: '{"key":"value","nested":[1,2,3]}',
      bytes: 32,
      digest: "d681b75a5d1682a0af97514a4dcbe0bcf0ca43ac0adece74d7cba3f8f1c52fe6",
    },
  ])(
    "preserves the independent $bytes-byte digest and attributes exactly one hash",
    ({ content, bytes, digest }) =>
      Effect.gen(function* () {
        const spans: Tracer.NativeSpan[] = [];
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options);
            spans.push(span);
            return span;
          },
        });
        expect(yield* computeSourceHash(content).pipe(withDetailedWork(tracer))).toBe(digest);
        const hashes = spans.filter((span) => span.name === "axm.hash.content");
        expect(hashes).toHaveLength(1);
        expect(hashes[0]?.status._tag === "Ended" && hashes[0].status.exit._tag).toBe("Success");
        expect(hashes[0]?.attributes.get("axm.work.bytes")).toBe(bytes);
        expect(hashes[0]?.attributes.get("axm.work.count")).toBe(1);
        expect(JSON.stringify(hashes.map((span) => [...span.attributes]))).not.toContain("private");
      }),
  );
});

describe("SourceHashSchema", () => {
  it("decodes a valid string to a branded SourceHash", () => {
    const result = Schema.decodeUnknownResult(SourceHashSchema)("abc123");
    expect(Result.isSuccess(result)).toBe(true);
  });

  it("rejects non-string values", () => {
    const result = Schema.decodeUnknownResult(SourceHashSchema)(42);
    expect(Result.isFailure(result)).toBe(true);
  });
});

describe("RenderedFilePathSchema", () => {
  it("decodes a workspace-relative path to a branded RenderedFilePath", () => {
    const result = Schema.decodeUnknownResult(RenderedFilePathSchema)(".claude/skills/my-skill.md");
    expect(Result.isSuccess(result)).toBe(true);
  });

  it("rejects absolute paths", () => {
    const result = Schema.decodeUnknownResult(RenderedFilePathSchema)(
      "/workspace/.claude/skills/my-skill.md",
    );
    expect(Result.isFailure(result)).toBe(true);
  });

  it("rejects escaping relative paths", () => {
    const result = Schema.decodeUnknownResult(RenderedFilePathSchema)("../outside.md");
    expect(Result.isFailure(result)).toBe(true);
  });
});
