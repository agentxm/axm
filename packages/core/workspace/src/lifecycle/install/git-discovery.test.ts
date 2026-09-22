import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import type { GitHostedSkillRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { GitSource } from "@agentxm/extension-model/unstable/sources/types";
import { SourceNetworkFailure } from "../../resolution/sources/errors.js";
import type { SourceHostProvidersService } from "../../resolution/sources/service.js";
import { makeLocatorSourceView } from "./git-discovery.js";

const source = {
  type: "git",
  url: new URL("https://example.test/repo.git"),
  ref: Option.none(),
  subPath: Option.none(),
} satisfies GitSource;

const name = decodeExtensionNameSync("review");
const skill = {
  type: "skill",
  refType: "git-hosted",
  source,
  owner: decodeHandleSync("@acme"),
  name,
  location: "file:///tmp/captured/review",
  sourcePath: "review",
  gitTreeSha: "0".repeat(40),
  gitCommitSha: "1".repeat(40),
  skill: { name, description: Option.none(), metadata: Option.none() },
} satisfies GitHostedSkillRef;

const options = {
  type: "skill",
  names: [],
  owner: Option.none(),
  versionRange: Option.none(),
} as const;

describe("Git locator source view", () => {
  it.effect("uses one captured view per locator plan and refreshes the next plan", () =>
    Effect.scoped(
      Effect.gen(function* () {
        let reads = 0;
        const providers: SourceHostProvidersService = {
          find: () =>
            Effect.sync(() => {
              reads++;
              return [skill];
            }),
          resolveNamedRegistry: () => Effect.die("unused"),
          fetch: () => Effect.die("unused"),
          cloneUrl: () => Option.none(),
          origin: () => "fixture",
        };

        const first = yield* makeLocatorSourceView(providers, 7);
        expect(yield* first.find(source, options)).toEqual([skill]);
        expect(yield* first.find(source, { ...options, type: "pack" })).toEqual([]);
        expect(yield* first.find(source, { ...options, names: ["other"] })).toEqual([]);
        expect(reads).toBe(1);

        const distinctRef = { ...source, ref: Option.some("main") } satisfies GitSource;
        expect(yield* first.find(distinctRef, options)).toEqual([skill]);
        expect(reads).toBe(2);

        const next = yield* makeLocatorSourceView(providers, 7);
        expect(yield* next.find(source, options)).toEqual([skill]);
        expect(reads).toBe(3);
      }),
    ),
  );

  it.effect("retries a failed source read within the same locator plan", () =>
    Effect.scoped(
      Effect.gen(function* () {
        let reads = 0;
        const providers: SourceHostProvidersService = {
          find: () =>
            Effect.suspend(() => {
              reads++;
              return reads === 1
                ? Effect.fail(new SourceNetworkFailure({ detail: "Temporary source failure" }))
                : Effect.succeed([skill]);
            }),
          resolveNamedRegistry: () => Effect.die("unused"),
          fetch: () => Effect.die("unused"),
          cloneUrl: () => Option.none(),
          origin: () => "fixture",
        };
        const view = yield* makeLocatorSourceView(providers, 7);
        expect((yield* view.find(source, options).pipe(Effect.result))._tag).toBe("Failure");
        expect(yield* view.find(source, options)).toEqual([skill]);
        expect(reads).toBe(2);
      }),
    ),
  );
});
