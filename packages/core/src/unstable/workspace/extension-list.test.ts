import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { decodeExtensionNameSync, type ExtensionRef } from "../extensions/index.js";
import {
  SourceHostProviders,
  type SourceHostProvidersService,
} from "../source-resolution/index.js";
import { trustRecordKey, type WorkspaceTrustState } from "../trust/index.js";
import { assessExtensionListItems, type ExtensionListItem } from "./extension-list.js";
import { WorkspaceMutations } from "./service-interface.js";
import { makeBaseWorkspaceMock } from "./test-stubs.js";

describe("extension list assessment", () => {
  it.effect("classifies Git-hosted revisions as current or changed", () =>
    Effect.gen(function* () {
      const records: WorkspaceTrustState["records"] = {
        [trustRecordKey("skill", "current")]: {
          extensionType: "skill",
          name: "current",
          authority: "github",
          sourceIdentity: "github:acme/extensions//skills/current",
          immutableRevision: "same-tree",
        },
        [trustRecordKey("skill", "changed")]: {
          extensionType: "skill",
          name: "changed",
          authority: "github",
          sourceIdentity: "github:acme/extensions//skills/changed",
          immutableRevision: "old-tree",
        },
      };
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getTrustState: () => Effect.succeed({ trustStateVersion: 1, records }),
        getConfiguredSources: () =>
          Effect.succeed([{ name: "github", type: "github", url: new URL("https://github.com") }]),
      });
      const refs: ReadonlyArray<ExtensionRef> = [
        {
          type: "skill",
          refType: "git-hosted",
          skill: {
            name: decodeExtensionNameSync("current"),
            description: Option.none(),
            metadata: Option.none(),
          },
          source: {
            type: "github",
            url: new URL("https://github.com"),
            owner: "acme",
            repo: "extensions",
            ref: Option.none(),
            subPath: Option.some("skills/current"),
          },
          location: "file:///tmp/current",
          sourcePath: "skills/current",
          gitTreeSha: Option.some("same-tree"),
        },
        {
          type: "skill",
          refType: "git-hosted",
          skill: {
            name: decodeExtensionNameSync("changed"),
            description: Option.none(),
            metadata: Option.none(),
          },
          source: {
            type: "github",
            url: new URL("https://github.com"),
            owner: "acme",
            repo: "extensions",
            ref: Option.none(),
            subPath: Option.some("skills/changed"),
          },
          location: "file:///tmp/changed",
          sourcePath: "skills/changed",
          gitTreeSha: Option.some("new-tree"),
        },
      ];
      const providers: SourceHostProvidersService = {
        resolveNamedRegistry: () => Effect.die("not used"),
        find: (_source, options) =>
          Effect.succeed(
            refs.filter((ref) =>
              options.names.includes(
                ref.type === "skill" ? ref.skill.name : decodeExtensionNameSync("unmatched"),
              ),
            ),
          ),
        fetch: () => Effect.die(new Error("not used")),
        cloneUrl: () => Option.none(),
        origin: () => "https://github.com/acme/extensions",
      };
      const layer = Layer.mergeAll(
        Layer.succeed(WorkspaceMutations, ws),
        Layer.succeed(SourceHostProviders, providers),
        NodeServices.layer,
      );
      const items: ReadonlyArray<ExtensionListItem> = [
        {
          ref: "skills/current",
          type: "skill",
          name: "current",
          management: "configured",
          installed: true,
          enabled: true,
          source: "github:acme/extensions//skills/current",
          assessment: { state: "not-checked" },
        },
        {
          ref: "skills/changed",
          type: "skill",
          name: "changed",
          management: "configured",
          installed: true,
          enabled: true,
          source: "github:acme/extensions//skills/changed",
          assessment: { state: "not-checked" },
        },
      ];

      const assessed = yield* Effect.scoped(assessExtensionListItems(items, "outdated")).pipe(
        Effect.provide(layer),
      );

      expect(assessed.map((item) => [item.name, item.assessment.state])).toEqual([
        ["current", "current"],
        ["changed", "changed"],
      ]);
    }),
  );

  it.effect("reports missing immutable Git revisions as unknown", () =>
    Effect.gen(function* () {
      const name = "review";
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getTrustState: () =>
          Effect.succeed({
            trustStateVersion: 1,
            records: {
              [trustRecordKey("skill", name)]: {
                extensionType: "skill",
                name,
                authority: "github",
                sourceIdentity: "github:acme/extensions//skills/review",
              },
            },
          }),
      });
      const layer = Layer.mergeAll(
        Layer.succeed(WorkspaceMutations, ws),
        Layer.succeed(SourceHostProviders, {
          resolveNamedRegistry: () => Effect.die("not used"),
          find: () => Effect.succeed([]),
          fetch: () => Effect.die(new Error("not used")),
          cloneUrl: () => Option.none(),
          origin: () => "https://github.com/acme/extensions",
        }),
        NodeServices.layer,
      );
      const item: ExtensionListItem = {
        ref: "skills/review",
        type: "skill",
        name,
        management: "configured",
        installed: true,
        enabled: true,
        source: "github:acme/extensions//skills/review",
        assessment: { state: "not-checked" },
      };

      const assessed = yield* assessExtensionListItems([item], "outdated").pipe(
        Effect.provide(layer),
      );

      expect(assessed[0]?.assessment).toEqual({
        state: "unknown",
        reason: "Trusted immutable revision is missing",
      });
    }),
  );
});
