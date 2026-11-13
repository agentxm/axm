import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Tracer from "effect/Tracer";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { ArtifactHttpClient, downloadHttpArtifact } from "./http-download.js";

const bodyGate = () => {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: () => release() };
};

it.live(
  "keeps body timing open until bytes arrive and attributes the independently known digest",
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
      const started = bodyGate();
      const release = bodyGate();
      const body = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            started.resolve();
            return release.promise.then(() => {
              controller.enqueue(new TextEncoder().encode("abc"));
              controller.close();
            });
          },
        },
        { highWaterMark: 0 },
      );
      const client = HttpClient.make((request) =>
        Effect.succeed(HttpClientResponse.fromWeb(request, new Response(body))),
      );
      const url = new URL("https://private.example/source?secret=value");
      const pending = yield* downloadHttpArtifact(url).pipe(
        Effect.provideService(ArtifactHttpClient, client),
        Effect.withTracer(tracer),
        Effect.forkChild,
      );
      yield* Effect.promise(() => started.promise);
      const consumption = spans.find((span) => span.name === "axm.artifact.body");
      expect(consumption?.status._tag).toBe("Started");
      expect(spans.some((span) => span.name === "axm.artifact.integrity")).toBe(false);
      release.resolve();
      const result = yield* Fiber.join(pending);
      expect(new TextDecoder().decode(result.bytes)).toBe("abc");
      expect(result.digest).toBe(
        "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
      expect(consumption?.status._tag).toBe("Ended");
      const integrity = spans.find((span) => span.name === "axm.artifact.integrity");
      expect(integrity?.status._tag).toBe("Ended");
      for (const span of [consumption, integrity]) {
        expect(span?.attributes.get("axm.work.bytes")).toBe(3);
        expect(span?.attributes.get("axm.work.executed")).toBe(1);
      }
      const mismatchClient = HttpClient.make((request) =>
        Effect.succeed(HttpClientResponse.fromWeb(request, new Response("changed"))),
      );
      const failure = yield* downloadHttpArtifact(url, { digest: result.digest }).pipe(
        Effect.provideService(ArtifactHttpClient, mismatchClient),
        Effect.withTracer(tracer),
        Effect.flip,
      );
      expect(failure).toMatchObject({ _tag: "SourceNotResolvable", category: "validation" });
      const rejected = spans.filter((span) => span.name === "axm.artifact.integrity").at(-1);
      expect(rejected?.status._tag === "Ended" && rejected.status.exit._tag).toBe("Failure");
      expect(rejected?.attributes.get("axm.work.bytes")).toBe(7);
      // This boundary owns artifact attributes; the CLI exporter owns standard HTTP redaction.
      const artifactSpans = spans.filter((span) => span.name.startsWith("axm.artifact."));
      expect(JSON.stringify(artifactSpans.map((span) => [...span.attributes]))).not.toContain(
        "private.example",
      );
    }),
);
