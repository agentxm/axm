import { describe, expect } from "vitest";
import { it } from "@effect/vitest";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";

import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";

import { NoProjectionParticipants } from "@agentxm/workspace-projection/testing";

import { allCatalogRuleIds } from "./catalog/index.js";
import { queryLintWorkspace } from "./run/lint-workspace.js";
import { isolatedLintRules, makeLintWorkspace } from "./testing.js";

/** A lint run reads no Registry, so a transport that refuses proves it. */
const OfflineHttpClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({
          request,
          cause: new Error("A lint run must not reach the network."),
          description: "Offline test transport",
        }),
      }),
    ),
  ),
);

describe("@agentxm/workspace-lint/testing", () => {
  it("silences every catalog rule but the one an example is about", () => {
    const ruleId = allCatalogRuleIds[0];
    if (ruleId === undefined) throw new Error("The catalog declares no rules");
    const rules = isolatedLintRules(ruleId, "error");
    expect(rules[ruleId]).toBe("error");
    expect(Object.values(rules).filter((severity) => severity !== "off")).toEqual(["error"]);
    expect(Object.keys(rules)).toHaveLength(allCatalogRuleIds.length);
    expect(() => isolatedLintRules("no-such-rule", "error")).toThrow(
      "Unknown lint rule 'no-such-rule'",
    );
  });

  it.effect("lints a throwaway workspace through the product's own services", () => {
    const ruleId = allCatalogRuleIds[0];
    if (ruleId === undefined) throw new Error("The catalog declares no rules");
    const workspace = makeLintWorkspace({
      settings: { agents: [], lint: { rules: isolatedLintRules(ruleId, "off") } },
    });
    const before = workspace.snapshot();
    return Effect.gen(function* () {
      const result = yield* queryLintWorkspace(
        {
          workspaceRoot: workspace.root,
          userHome: workspace.root,
          scope: "project",
          input: { view: "workspace" },
          fix: false,
        },
        { strict: false },
      );
      // Every rule is silenced, so a clean run is the honest outcome and the
      // read-only query left the workspace exactly as it found it.
      expect(result.outcome).toBe("success");
      expect(workspace.snapshot()).toEqual(before);
    }).pipe(
      Effect.provide(
        workspace.layer.pipe(
          Layer.provideMerge(
            Layer.mergeAll(NodeServices.layer, OfflineHttpClient, NoProjectionParticipants),
          ),
        ),
      ),
      Effect.ensuring(Effect.sync(workspace.cleanup)),
    );
  });
});
