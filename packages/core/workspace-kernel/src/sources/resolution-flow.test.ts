import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";

import { resolveSource } from "./resolve-source.js";
import { SourceHostProviders, type SourceHostProvidersService } from "./service.js";
import { makeTestWorkspaceCatalog } from "./test-helpers.js";

const Workspace = Layer.mergeAll(
  makeTestWorkspaceCatalog({
    sources: [
      {
        type: "registry",
        name: "agentxm",
        location: new URL("https://registry.agentxm.ai"),
      },
    ],
  }),
  Layer.provideMerge(RegistryTransportTest(FetchHttpClient.layer), NodeServices.layer),
);

describe("resolution flow", () => {
  it.effect("passes the expanded Git locator unchanged to discovery", () =>
    Effect.gen(function* () {
      const source = yield* resolveSource("gitlab:group/subgroup/repo//skills/review@main").pipe(
        Effect.provide(Workspace),
      );
      const service: SourceHostProvidersService = {
        resolveNamedRegistry: () => Effect.die("not used"),
        find: (candidate) =>
          Effect.sync(() => expect(candidate).toEqual(source)).pipe(Effect.as([])),
        fetch: () => Effect.die("not used"),
        acquireForTransition: () => Effect.die("not used"),
        cloneUrl: () => Option.none(),
        origin: () => "test",
      };
      yield* Effect.gen(function* () {
        const providers = yield* SourceHostProviders;
        yield* providers.find(source, {
          names: [],
          type: "skill",
          owner: Option.none(),
          versionRange: Option.none(),
        });
      }).pipe(Effect.provideService(SourceHostProviders, service), Effect.scoped);
      expect(source.type).toBe("git");
      if (source.type === "git") {
        expect(source.url.href).toBe("https://gitlab.com/group/subgroup/repo.git");
        expect(Option.getOrNull(source.subPath)).toBe("skills/review");
      }
    }),
  );
});
