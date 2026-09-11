import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { ExtensionLifecycleFailed } from "../../errors.js";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../../install/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/install/local-name-requests-are-validated-before-any-change",
  title: "Locally named MCP install requests are validated before any workspace change",
  statement:
    "When an MCP install names a local connection, AXM shall reject the request before any workspace change, with an error naming the violated rule, if the local name is invalid, the name is already owned by a different source, or the requested version constraint does not intersect the constraints the source's other origins already declare.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["decision-table", "example"],
  derivedFrom: ["cli/mcps/install/local-connection-names-share-source-resolution"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Validate locally named MCP install requests", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const setup = (servers: ReadonlyArray<{ name: string; versions: ReadonlyArray<string> }>) => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    for (const server of servers)
      world.registry.writeMcp(
        server.name,
        server.versions.map((version) => ({ version })),
      );
    return world;
  };

  /** The request `axm mcps install <source> --as <name>` builds. */
  const install = (source: string, localName: string) =>
    applyInstall(
      installRequest({
        type: "mcp-server",
        subject: { kind: "source", source },
        localName,
      }),
    );

  /** Settings and the accepted resolutions, as the workspace holds them now. */
  const recordedState = (world: InstallWorld) => ({
    settings: world.workspace.readFile("axm.json"),
    lockfile: world.workspace.readFile("axm-lock.yaml"),
  });

  /** The sentence the refusal names the violated rule in. */
  const refusalDetail = (failure: unknown): string => {
    expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
    if (!(failure instanceof ExtensionLifecycleFailed))
      throw new Error("Expected a lifecycle refusal");
    return failure.detail ?? failure.category;
  };

  it.effect.each(["Uppercase", "-leading", "trailing-", "space name"])(
    "rejects the invalid local name %s without changing settings or resolutions",
    (localName) => {
      const world = setup([{ name: "context", versions: ["1.0.0"] }]);
      return world.workspace
        .provide(
          Effect.gen(function* () {
            const before = recordedState(world);

            const failure = yield* install("@acme/mcps/context", localName).pipe(Effect.flip);

            expect(refusalDetail(failure)).toContain("Local MCP names");
            expect(recordedState(world)).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("rejects reusing a local name for a different source without mutation", () => {
    const world = setup([
      { name: "context", versions: ["1.0.0"] },
      { name: "search", versions: ["1.0.0"] },
    ]);
    return world.workspace
      .provide(
        Effect.gen(function* () {
          yield* install("@acme/mcps/context", "work-tools");
          const before = recordedState(world);

          const failure = yield* install("@acme/mcps/search", "work-tools").pipe(Effect.flip);

          expect(refusalDetail(failure)).toContain("already owned by a different source");
          expect(recordedState(world)).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("rejects non-intersecting version constraints for one shared source closure", () => {
    const world = setup([{ name: "context", versions: ["1.0.0", "2.0.0"] }]);
    return world.workspace
      .provide(
        Effect.gen(function* () {
          yield* install("@acme/mcps/context@^1.0.0", "work-context");
          const before = recordedState(world);

          const failure = yield* install("@acme/mcps/context@^2.0.0", "personal-context").pipe(
            Effect.flip,
          );

          expect(refusalDetail(failure)).toContain("constraints do not intersect");
          expect(recordedState(world)).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
