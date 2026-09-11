/**
 * Driving whole-extension Registry visibility from this package's own
 * specifications.
 *
 * Visibility reads and writes are the one lifecycle family that combines a
 * repository fact with a remote one: the declared intent comes from the
 * authored manifest or the workspace default, and the established value comes
 * from the Registry. The world here is therefore a real throwaway workspace
 * with the production workspace-state services over it, and a transport that
 * records every request with the precondition it carried.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  AuthClientTest,
  AuthLoginInteractionTest,
  AuthLoginPresenterTest,
  CredentialStoreTest,
} from "@agentxm/registry-auth/testing";
import { RegistryUrlTest, testRegistryUrl } from "@agentxm/registry-client/testing";
import { layer as WorkspaceStateLayer } from "@agentxm/workspace-state/live";

import { observedRevision, registryTarget } from "../test-helpers.js";
import { writeAuthoredExtension } from "../testing.js";

export interface VisibilityRequest {
  readonly method: string;
  readonly url: URL;
  readonly ifMatch: string | undefined;
  readonly body: unknown;
}

export interface VisibilityWorldOptions {
  /** `publish.visibility` in the authored manifest. */
  readonly manifest?: "public" | "private";
  /** `publish.defaultVisibility` in the workspace settings. */
  readonly workspace?: "public" | "private";
  /** Workspace scope; repository intent exists only in a project. */
  readonly scope?: "project" | "user";
}

/**
 * A workspace holding one authored skill, with the declared visibility intent
 * the options name, and a Registry transport that records what it was asked.
 */
export const makeVisibilityWorld = (
  respond: (request: VisibilityRequest, index: number) => Response,
  options: VisibilityWorldOptions = {},
) => {
  const scope = options.scope ?? "project";
  const home = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-visibility-home-")));
  const root =
    scope === "user"
      ? nodePath.join(home, ".axm", "workspace")
      : fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-visibility-")));
  fs.mkdirSync(nodePath.join(root, ".axm"), { recursive: true });
  fs.writeFileSync(
    nodePath.join(root, "axm.json"),
    JSON.stringify(
      {
        owner: "@acme",
        agents: [],
        skills: { review: "workspace" },
        ...(options.workspace === undefined
          ? {}
          : { publish: { defaultVisibility: options.workspace } }),
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    nodePath.join(root, "axm-lock.yaml"),
    JSON.stringify({ lockfileVersion: 7, skills: {} }),
  );
  writeAuthoredExtension(root, "skill", { name: "review" });
  if (options.manifest !== undefined) {
    fs.writeFileSync(
      nodePath.join(root, "skills", "review", "skill.json"),
      JSON.stringify({
        owner: "@acme",
        type: "skill",
        name: "review",
        version: "1.0.0",
        publish: { visibility: options.manifest },
      }),
    );
  }

  const requests: Array<VisibilityRequest> = [];
  const transport = HttpClient.make((request) =>
    Effect.sync(() => {
      const url = new URL(request.url);
      for (const [key, value] of request.urlParams) url.searchParams.append(key, value);
      const observed: VisibilityRequest = {
        method: request.method,
        url,
        ifMatch: request.headers["if-match"],
        body:
          request.body._tag === "Uint8Array"
            ? JSON.parse(new TextDecoder().decode(request.body.body))
            : undefined,
      };
      requests.push(observed);
      return HttpClientResponse.fromWeb(request, respond(observed, requests.length - 1));
    }),
  );

  const services = Layer.provideMerge(
    Layer.mergeAll(
      WorkspaceStateLayer({ scope, projectRoot: decodeAbsolutePathSync(root) }),
      AuthClientTest(),
      AuthLoginInteractionTest().layer,
      AuthLoginPresenterTest().layer,
      CredentialStoreTest(),
      RegistryUrlTest(testRegistryUrl),
      Layer.succeed(HttpClient.HttpClient, transport),
    ),
    Layer.merge(
      NodeServices.layer,
      // A hermetic user home: user-scope state is this world's, and the
      // machine's real home is never read or written.
      ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } })),
    ),
  );

  return {
    root,
    requests,
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(services)),
    cleanup: (): void => {
      fs.rmSync(home, { recursive: true, force: true });
      if (scope !== "user") fs.rmSync(root, { recursive: true, force: true });
    },
  };
};

/** The declared intent the Registry is asked to compare against. */
export const visibilityIntent = (
  source: "manifest" | "workspace",
  value: "public" | "private",
) => ({
  value,
  source,
  fingerprint: createHash("sha256")
    .update(
      JSON.stringify({
        source,
        value,
        material: JSON.stringify({
          publish: source === "manifest" ? { visibility: value } : { defaultVisibility: value },
        }),
      }),
    )
    .digest("hex"),
});

/** One Registry visibility evaluation, as the Registry returns it. */
export const visibilityEvaluation = (
  intent: ReturnType<typeof visibilityIntent> | null = null,
  actual: "public" | "private" | null = "public",
) => ({
  target: registryTarget,
  intent,
  request: null,
  resolved: null,
  actual: actual === null ? null : { value: actual, revision: observedRevision },
  comparison:
    actual === null
      ? "not-established"
      : intent === null
        ? "unconfigured"
        : intent.value === actual
          ? "match"
          : "drift",
  findings: [],
});
