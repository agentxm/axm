import { withDetailedWork } from "./testing.js";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Tracer from "effect/Tracer";
import {
  applyDigestedStructuralInverse,
  applyStructuralInverse,
  deriveStructuralInverse,
  digestText,
  isStructuralInsertion,
  readContainerReceipts,
} from "./container-receipts.js";

it.effect("counts actual receipt digests including rejection using fixed UTF-8 vectors", () =>
  Effect.gen(function* () {
    const spans: Tracer.NativeSpan[] = [];
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    yield* Effect.gen(function* () {
      const before = "{}";
      const after = '{"owned":"α"}';
      const inverse = yield* deriveStructuralInverse(before, after);
      expect(Option.isSome(inverse)).toBe(true);
      if (Option.isNone(inverse)) return;
      expect(inverse.value).toMatchObject({
        beforeSha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        afterSha256: "b9f4bae256fea25c06bd0588beceb53431c165542875785cd2fa09f7bab74b0c",
      });
      expect(yield* applyStructuralInverse(after, inverse.value)).toEqual(Option.some(before));
      expect(yield* applyStructuralInverse(after + "\n", inverse.value)).toEqual(Option.none());
      expect(yield* deriveStructuralInverse(before, before)).toEqual(Option.none());
    }).pipe(withDetailedWork(tracer));
    const hashes = spans.filter((span) => span.name === "axm.hash.receipt");
    expect(hashes.map((span) => span.attributes.get("axm.work.bytes"))).toEqual([2, 14, 14, 2, 15]);
    expect(
      hashes.every(
        (span) => span.attributes.get("axm.work.count") === 1 && span.status._tag === "Ended",
      ),
    ).toBe(true);
    expect(JSON.stringify(hashes.map((span) => [...span.attributes]))).not.toContain("owned");
  }),
);

it.effect(
  "binds one receipt digest to the text it hashes and reuses it for inverse application",
  () =>
    Effect.gen(function* () {
      const spans: Tracer.NativeSpan[] = [];
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      const hashSpans = () =>
        spans
          .filter((span) => span.name === "axm.hash.receipt")
          .map((span) => ({
            bytes: span.attributes.get("axm.work.bytes"),
            count: span.attributes.get("axm.work.count"),
            status: span.status._tag,
          }));
      const before = "{}";
      const after = '{"owned":"α"}';
      const inverse = yield* deriveStructuralInverse(before, after);
      expect(Option.isSome(inverse)).toBe(true);
      if (Option.isNone(inverse)) return;
      const text = yield* digestText(after).pipe(withDetailedWork(tracer));
      expect({ raw: text.raw, sha256: text.sha256 }).toEqual({
        raw: after,
        sha256: inverse.value.afterSha256,
      });
      expect(hashSpans()).toEqual([{ bytes: 14, count: 1, status: "Ended" }]);
      const changed = yield* digestText(after + "\n");
      spans.length = 0;
      const restored = yield* applyDigestedStructuralInverse(text, inverse.value).pipe(
        withDetailedWork(tracer),
      );
      expect(Option.map(restored, (value) => [value.raw, value.sha256])).toEqual(
        Option.some([before, inverse.value.beforeSha256]),
      );
      expect(hashSpans()).toEqual([{ bytes: 2, count: 1, status: "Ended" }]);
      spans.length = 0;
      const rejected = yield* applyDigestedStructuralInverse(changed, inverse.value).pipe(
        withDetailedWork(tracer),
      );
      expect(hashSpans()).toEqual([]);
      expect(Option.map(restored, (value) => value.raw)).toEqual(
        yield* applyStructuralInverse(after, inverse.value),
      );
      expect(Option.map(rejected, (value) => value.raw)).toEqual(
        yield* applyStructuralInverse(after + "\n", inverse.value),
      );
    }),
);

it.effect("judges structural insertions without receipt digests", () =>
  Effect.gen(function* () {
    const spans: Tracer.NativeSpan[] = [];
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    const corpus: ReadonlyArray<readonly [string, string]> = [
      ['{"foreign":1}', '{"foreign":1,"owned":2}'],
      ['{"foreign":1,"list":[]}', '{\n  "foreign": 1,\n  "list": ["owned"]\n}\n'],
      ['{"foreign":1}', '{"foreign":2}'],
      ['{"foreign":1}', '{"foreign":1}'],
    ];
    const verdicts = yield* Effect.sync(() =>
      corpus.map(([before, after]) => isStructuralInsertion(before, after)),
    ).pipe(withDetailedWork(tracer));
    expect(verdicts).toEqual([true, true, false, false]);
    expect(spans.filter((span) => span.name === "axm.hash.receipt")).toEqual([]);
    const derived: Array<boolean> = [];
    for (const [before, after] of corpus)
      derived.push(Option.isSome(yield* deriveStructuralInverse(before, after)));
    expect(verdicts).toEqual(derived);
  }),
);

it.effect("attributes receipt decoding for valid and corrupt files without changing bytes", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped();
    const target = path.join(directory, "projection-containers.json");
    const spans: Tracer.NativeSpan[] = [];
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    yield* fs.writeFileString(target, '{"version":1,"entries":[],"createdDirectories":[]}');
    expect(yield* readContainerReceipts(directory).pipe(withDetailedWork(tracer))).toEqual({
      version: 1,
      entries: [],
      createdDirectories: [],
    });
    yield* fs.writeFileString(target, '{"version":');
    const invalid = yield* readContainerReceipts(directory).pipe(
      withDetailedWork(tracer),
      Effect.result,
    );
    expect(invalid._tag).toBe("Failure");
    expect(yield* fs.readFileString(target)).toBe('{"version":');
    const parses = spans.filter((span) => span.name === "axm.parse.receipts");
    expect(parses.map((span) => span.status._tag === "Ended" && span.status.exit._tag)).toEqual([
      "Success",
      "Failure",
    ]);
    expect(parses.map((span) => span.attributes.get("axm.work.count"))).toEqual([1, 1]);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
