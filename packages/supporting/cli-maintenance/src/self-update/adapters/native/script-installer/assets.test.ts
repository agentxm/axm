import { CurrentWorkObserver, type WorkFact } from "@agentxm/host-primitives/work-observation";
import { createHash } from "node:crypto";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Tracer from "effect/Tracer";
import * as Ref from "effect/Ref";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { makeScriptReleaseAssets } from "./assets.js";

describe("native release asset observations", () => {
  for (const declaredLength of [undefined, "5"]) {
    it.effect(
      `returns exact streamed bytes with content length ${declaredLength ?? "unknown"}`,
      () =>
        Effect.gen(function* () {
          const progress = yield* Ref.make<
            ReadonlyArray<{
              readonly binary: string;
              readonly received: number;
              readonly total: number | undefined;
            }>
          >([]);
          const bytes = new Uint8Array([1, 2, 3, 4, 5]);
          const manifest = "fixture checksum manifest\n";
          const source = {
            binaryAssetUrl: "https://release.example/axm-linux-x64",
            checksumAssetUrl: "https://release.example/SHA256SUMS",
          };
          const client = HttpClient.make((request) =>
            Effect.sync(() => {
              if (request.url === source.checksumAssetUrl) {
                return HttpClientResponse.fromWeb(request, new Response(manifest));
              }
              const body = new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(bytes.slice(0, 2));
                  controller.enqueue(bytes.slice(2));
                  controller.close();
                },
              });
              return HttpClientResponse.fromWeb(
                request,
                new Response(body, {
                  headers: declaredLength === undefined ? {} : { "content-length": declaredLength },
                }),
              );
            }),
          );
          const assets = makeScriptReleaseAssets(client, (binary, read) =>
            read((received, total) =>
              Ref.update(progress, (observations) => [
                ...observations,
                { binary, received, total },
              ]),
            ),
          );

          const result = yield* assets.read(source, "axm-linux-x64");
          expect(result.bytes).toEqual(bytes);
          expect(result.sha256Hex).toBe(createHash("sha256").update(bytes).digest("hex"));
          expect(result.checksumManifest).toBe(manifest);
          expect(yield* Ref.get(progress)).toEqual(
            [2, 5].map((received) => ({
              binary: "axm-linux-x64",
              received,
              total: declaredLength === undefined ? undefined : 5,
            })),
          );
        }),
    );
  }
});

for (const outcome of ["success", "failure", "interrupt"] as const) {
  it.effect(`accounts for release bytes and keeps body work open until ${outcome}`, () =>
    Effect.gen(function* () {
      const spans: Array<Tracer.NativeSpan> = [];
      const facts: WorkFact[] = [];
      const ends = new Map<string, number>();
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          const end = span.end.bind(span);
          span.end = (time, exit) => {
            ends.set(span.spanId, (ends.get(span.spanId) ?? 0) + 1);
            end(time, exit);
          };
          spans.push(span);
          return span;
        },
      });
      const progressed = yield* Deferred.make<void>();
      const controllerReady = yield* Deferred.make<ReadableStreamDefaultController<Uint8Array>>();
      const requests: Array<string> = [];
      const source = {
        binaryAssetUrl: "https://release.example/PRIVATE_BINARY",
        checksumAssetUrl: "https://release.example/PRIVATE_MANIFEST",
      };
      const client = HttpClient.make((request) =>
        Effect.sync(() => {
          requests.push(request.url);
          return HttpClientResponse.fromWeb(
            request,
            request.url === source.binaryAssetUrl
              ? new Response(
                  new ReadableStream<Uint8Array>({
                    start(controller) {
                      controller.enqueue(new Uint8Array([1, 2]));
                      Deferred.doneUnsafe(controllerReady, Effect.succeed(controller));
                    },
                  }),
                )
              : new Response("checksum\n"),
          );
        }),
      );
      const assets = makeScriptReleaseAssets(client, (_name, read) =>
        read(() => Deferred.succeed(progressed, undefined).pipe(Effect.asVoid)),
      );
      const fiber = yield* assets.read(source, "PRIVATE_BINARY").pipe(
        Effect.provideService(CurrentWorkObserver, {
          record: (fact) => {
            facts.push(fact);
          },
          detailSelected: () => false,
        }),
        Effect.withTracer(tracer),
        Effect.withTracerEnabled(true),
        Effect.forkChild,
      );
      yield* Deferred.await(progressed);
      const controller = yield* Deferred.await(controllerReady);
      const body = spans.find(
        (span) =>
          span.name === "axm.update.body" && span.attributes.get("axm.update.purpose") === "binary",
      );
      expect(body?.status._tag).toBe("Started");
      expect(body?.attributes.get("axm.work.bytes")).toBe(2);
      if (outcome === "interrupt") yield* Fiber.interrupt(fiber);
      else {
        yield* Effect.sync(() => {
          if (outcome === "failure") controller.error(new Error("PRIVATE_FAILURE"));
          else {
            controller.enqueue(new Uint8Array([3, 4, 5]));
            controller.close();
          }
        });
        expect(Exit.isSuccess(yield* Fiber.await(fiber))).toBe(outcome === "success");
      }
      expect(body?.status._tag).toBe("Ended");
      expect(body === undefined ? 0 : ends.get(body.spanId)).toBe(1);
      expect(body?.attributes.get("axm.work.bytes")).toBe(outcome === "success" ? 5 : 2);
      expect(spans.filter((span) => span.name === "axm.update.request")).toHaveLength(
        requests.length,
      );
      const hashes = facts.filter((fact) => fact.kind === "axm.update.integrity");
      expect(hashes).toHaveLength(outcome === "success" ? 1 : 0);
      if (outcome === "success") {
        expect(hashes[0]?.attributes["axm.work.bytes"]).toBe(5);
        expect(
          spans
            .find(
              (span) =>
                span.name === "axm.update.body" &&
                span.attributes.get("axm.update.purpose") === "checksums",
            )
            ?.attributes.get("axm.work.bytes"),
        ).toBe(9);
      }
      expect(
        // Raw platform HTTP spans are filtered by the CLI exporter, whose privacy
        // contract is tested there. This owner adds only bounded semantic fields.
        JSON.stringify(
          spans
            .filter((span) => span.name.startsWith("axm."))
            .map((span) => Object.fromEntries(span.attributes)),
        ),
      ).not.toContain("PRIVATE");
    }),
  );
}
