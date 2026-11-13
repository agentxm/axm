import { createHash } from "node:crypto";
import { expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { makeFileRegistry } from "@agentxm/registry-client/testing";
import { ResolutionResponseSchema } from "@agentxm/registry-protocol/unstable/registry/resolutions";
import { startLifecycleRegistry } from "../benchmarks/lifecycle-registry.js";

it.effect(
  "benchmark Registry serves current selection and exact admission with independent wire counts",
  () =>
    Effect.gen(function* () {
      const fixture = yield* Effect.acquireRelease(Effect.sync(makeFileRegistry), (value) =>
        Effect.sync(() => value.cleanup()),
      );
      fixture.writeSkill("bench-001", [{ version: "1.0.0", body: "Benchmark guidance." }]);
      const registry = yield* Effect.acquireRelease(
        Effect.promise(() => startLifecycleRegistry(fixture.root, 0)),
        (value) => Effect.promise(() => value.close()),
      );
      registry.reset(true);
      const identity = { owner: "@acme", type: "skill", name: "bench-001" };
      const post = (body: unknown) =>
        Effect.gen(function* () {
          const response = yield* HttpClient.execute(
            HttpClientRequest.post(`${registry.url}/v1/resolutions`).pipe(
              HttpClientRequest.bodyJsonUnsafe(body),
            ),
          );
          expect(response.status).toBe(200);
          expect(response.headers["cache-control"]).toBe("private, no-store");
          return Schema.decodeUnknownSync(ResolutionResponseSchema)(yield* response.json);
        });
      const selected = yield* post({
        schemaVersion: 2,
        purpose: "select",
        selectionPolicyVersion: "1",
        items: [{ key: "select", identity }],
      });
      if (selected.purpose !== "select") throw new Error("Expected selection response");
      const metadata = selected.results[0];
      if (metadata?.outcome !== "metadata") throw new Error("Expected fixture metadata");
      const version = metadata.page.versions[0];
      if (version === undefined) throw new Error("Expected fixture version");
      const exact = {
        identity,
        expectedPublisherBinding: metadata.page.publisherBindingId,
        accepted: { version: version.version, integrity: version.integrity },
      };
      const admitted = yield* post({
        schemaVersion: 2,
        purpose: "authorize-exact",
        items: [
          { key: "valid", ...exact },
          { key: "changed", ...exact, accepted: { ...exact.accepted, integrity: "changed" } },
          { key: "publisher", ...exact, expectedPublisherBinding: "different" },
        ],
      });
      expect(admitted).toMatchObject({
        purpose: "authorize-exact",
        results: [
          { key: "valid", outcome: "allowed", identity, accepted: exact.accepted },
          { key: "changed", outcome: "exact-conflict", reason: "integrity-mismatch" },
          { key: "publisher", outcome: "binding-conflict" },
        ],
      });
      expect(registry.metrics()).toMatchObject({ requests: 2, archiveBodies: 0, archiveBytes: 0 });
      const bytes = yield* Effect.gen(function* () {
        const archive = yield* HttpClient.get(
          `${registry.url}/v1/extensions/%40acme/skills/bench-001/1.0.0/archive`,
        );
        expect(archive.status).toBe(200);
        return new Uint8Array(yield* archive.arrayBuffer);
      });
      expect(`sha512-${createHash("sha512").update(bytes).digest("base64")}`).toBe(
        version.integrity,
      );
      expect(registry.metrics()).toMatchObject({
        requests: 3,
        archiveBodies: 1,
        archiveBytes: bytes.byteLength,
      });
    }).pipe(Effect.provide(FetchHttpClient.layer)),
);
