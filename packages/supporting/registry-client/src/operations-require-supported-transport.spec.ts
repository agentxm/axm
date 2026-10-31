import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/http/HttpClient";
import * as Path from "effect/Path";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { defineSpecification } from "@agentxm/specification-metadata";

import { makeRegistryClientFactory } from "./index.js";
import { passThroughRegistryAuthorization } from "./testing.js";

export const specification = defineSpecification({
  requirement: "registry/operations-require-supported-transport",
  title: "A Registry operation runs only on a transport that implements it",
  statement:
    "AXM shall serve reads, discovery, publication, and visibility from both http(s) and file Registries, and shall refuse lifecycle management and authentication against a file Registry with a typed unsupported-operation result naming the operation and the Registry, before any request, credential, or filesystem change.",
  class: "functional",
  role: "interface",
  goals: ["actionable-diagnostics", "trustworthy-distribution"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-client/src/capabilities.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Whether a file Registry should later implement lifecycle management is undecided; this delivery refuses it.",
  ],
});

const http = decodeRegistryEndpointSync("https://registry.example.test");

describe("Registry transport support", () => {
  it.effect("opens a file Registry client and serves server operations over http(s)", () => {
    const file = decodeRegistryEndpointSync("file:///srv/registry");
    const httpClient = HttpClient.make(() => Effect.die("Building a client sends no request."));
    return Effect.gen(function* () {
      const factory = yield* makeRegistryClientFactory({
        httpClient,
        fileSystem: FileSystem.makeNoop({}),
        path: yield* Path.Path,
        authorization: passThroughRegistryAuthorization,
      });
      const client = yield* factory.forEndpoint(file);
      const lifecycle = yield* factory.lifecycle(http, "Deprecating an extension");
      const auth = yield* factory.wire(http, { operation: "Signing in" });
      expect(client).toBeDefined();
      expect(lifecycle).toBeDefined();
      expect(auth.endpoint).toEqual(http);
    }).pipe(Effect.provide(Path.layer));
  });

  it.effect("refuses file lifecycle and authentication before touching anything", () => {
    const root = mkdtempSync(nodePath.join(tmpdir(), "axm-unsupported-"));
    const file = decodeRegistryEndpointSync(pathToFileURL(root).href);
    const touched: Array<string> = [];
    const fileSystem = FileSystem.makeNoop({
      makeDirectory: (path) => Effect.sync(() => void touched.push(`mkdir ${path}`)),
      writeFile: (path) => Effect.sync(() => void touched.push(`write ${path}`)),
      remove: (path) => Effect.sync(() => void touched.push(`remove ${path}`)),
      rename: (path) => Effect.sync(() => void touched.push(`rename ${path}`)),
    });
    const requests: Array<string> = [];
    const httpClient = HttpClient.make((request) =>
      Effect.sync(() => void requests.push(request.url)).pipe(
        Effect.andThen(Effect.die("A refused operation sends no request.")),
      ),
    );
    return Effect.gen(function* () {
      const factory = yield* makeRegistryClientFactory({
        httpClient,
        fileSystem,
        path: yield* Path.Path,
        authorization: passThroughRegistryAuthorization,
      });
      const lifecycle = yield* factory
        .lifecycle(file, "Deprecating an extension")
        .pipe(Effect.flip);
      const auth = yield* factory.wire(file, { operation: "Signing in" }).pipe(Effect.flip);
      for (const [refusal, operation] of [
        [lifecycle, "Deprecating an extension"],
        [auth, "Signing in"],
      ] as const) {
        expect(refusal).toMatchObject({
          _tag: "RegistryOperationUnsupported",
          category: "validation",
          operation,
          endpoint: file.href,
          transport: "file",
        });
        expect(refusal.detail).toContain(file.href);
      }
      expect(touched).toEqual([]);
      expect(requests).toEqual([]);
    }).pipe(
      Effect.provide(Path.layer),
      Effect.ensuring(Effect.sync(() => rmSync(root, { recursive: true, force: true }))),
    );
  });
});
