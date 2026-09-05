/** Actual discovery and inspection handlers over workspace files and a controlled Registry HTTP port. */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as Layer from "effect/Layer";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import {
  RegistryUrl,
  ExecutionDirectory,
  makeCliTestContext,
  makeWorkspaceHandlerTestContext,
  makeEffectProvide,
} from "axm.sh/specification-harness";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { makeSpecWorkspace, type SpecWorkspaceOptions } from "./install-harness.js";

export const readRegistry = "https://read-registry.example.test";
type ObservedRequest = {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
  readonly hasAuthorization: boolean;
};
type ResponseFixture = { readonly status?: number; readonly body: unknown };
const registryPort = (
  requests: Array<ObservedRequest>,
  respond: (request: ObservedRequest) => ResponseFixture,
  firstRequest?: Deferred.Deferred<void>,
) =>
  HttpClient.make((request) =>
    Effect.gen(function* () {
      const observed = {
        method: request.method,
        url: request.url,
        body:
          request.body._tag === "Uint8Array"
            ? JSON.parse(new TextDecoder().decode(request.body.body))
            : undefined,
        hasAuthorization: request.headers["authorization"] !== undefined,
      };
      requests.push(observed);
      if (firstRequest !== undefined) yield* Deferred.succeed(firstRequest, undefined);
      const result = respond(observed);
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(result.body), {
          status: result.status ?? 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );

export const makePublicReadSpecContext = (
  respond: (request: ObservedRequest) => ResponseFixture,
) => {
  const requests: Array<ObservedRequest> = [];
  const context = makeCliTestContext({
    machine: true,
    httpClient: registryPort(requests, respond),
  });
  const provide = makeEffectProvide(context.baseLayer);
  return {
    ...context,
    requests,
    provide: <A, E, R>(program: Effect.Effect<A, E, R>) =>
      program.pipe(Effect.provideService(RegistryUrl, readRegistry), provide),
  };
};

export const makeReadSpecWorkspace = (options: SpecWorkspaceOptions = {}) => {
  const workspace = makeSpecWorkspace({ machine: true, userSettings: {}, ...options });
  const requests: Array<ObservedRequest> = [];
  const firstRequest = Deferred.makeUnsafe<void>();
  const writeJson = (relativePath: string, value: unknown) => {
    const file = path.join(workspace.root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  };
  const withRegistry = <A, E, R>(
    program: Effect.Effect<A, E, R>,
    respond: (request: ObservedRequest) => ResponseFixture,
  ) =>
    program.pipe(
      Effect.provideService(HttpClient.HttpClient, registryPort(requests, respond, firstRequest)),
      Effect.provideService(RegistryUrl, readRegistry),
      Effect.provideService(ExecutionDirectory, { path: decodeAbsolutePathSync(workspace.root) }),
      workspace.provide,
    );
  return {
    ...workspace,
    requests,
    waitForRegistryRequest: Deferred.await(firstRequest),
    writeJson,
    withRegistry,
  };
};

export const readExtensionIndex = {
  owner: "@acme",
  type: "skill",
  name: "review",
  description: "Review guidance",
  publisher_binding_id: "hbnd_read_fixture",
  visibility: "public",
  deprecation: null,
  versions: [
    { version: "1.1.0", published: "2026-02-01T00:00:00.000Z", integrity: "sha512-BBBB==" },
    { version: "1.0.0", published: "2026-01-01T00:00:00.000Z", integrity: "sha512-AAAA==" },
  ],
};

/** The command-layer allowance for read-only inventory before setup, over isolated user state. */
export const makeUninitializedReadSpecContext = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-read-uninitialized-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "axm-read-home-"));
  const context = makeWorkspaceHandlerTestContext({
    machine: true,
    wsOptions: { projectRoot: root, scope: "project", allowUninitialized: true },
  });
  for (const file of ["axm.json", "axm-lock.yaml"])
    fs.rmSync(path.join(root, file), { force: true });
  const layer = Layer.provide(
    context.fullLayer,
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } })),
  );
  return {
    ...context,
    root,
    provide: makeEffectProvide(layer),
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
};
