import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { AuthClientTest, AuthLoginInteractionTest } from "@agentxm/registry-access/testing";

import { makeWorkspaceHandlerTestContext } from "../../test-support/test-helpers.js";
import { humanScreenLayer, makeRecordingStreams } from "../../test-support/screen-harness.js";
import { handleVisibilitySet, handleVisibilityStatus } from "./handler.js";

const target = "@acme/skills/review";
const evaluation = {
  target,
  intent: null,
  request: null,
  resolved: null,
  actual: { value: "public", revision: "revision-before-write" },
  comparison: "unconfigured",
  findings: [
    {
      code: "visibility/intent-required",
      severity: "warning",
      message: "Repository visibility is not configured.",
    },
  ],
};

describe("visibility human output", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-visibility-output-"));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.effect("keeps intent, actual state and findings together on stdout", () => {
    const streams = makeRecordingStreams();
    const httpClient = HttpClient.make((request) =>
      Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(evaluation))),
    );
    const context = makeWorkspaceHandlerTestContext({
      httpClient,
      screenLayer: humanScreenLayer(streams),
      wsOptions: { projectRoot: root },
    });
    return context.provide(
      Effect.gen(function* () {
        yield* handleVisibilityStatus(target);
        const stdout = streams.lines("stdout").join("\n");
        for (const fact of [
          target,
          "not configured",
          "public",
          "unconfigured",
          evaluation.findings[0]?.message ?? "",
        ])
          expect(stdout).toContain(fact);
        expect(streams.lines("stderr").join("\n")).toContain("Inspect visibility");
      }),
    );
  });

  for (const result of ["changed", "already-satisfied"] as const) {
    it.effect(`reports ${result} with the acknowledged revision on stdout`, () => {
      const mutation = {
        target,
        before: "public",
        after: "private",
        authority: { kind: "operator" },
        result,
        revision: "revision-after-write",
      };
      const streams = makeRecordingStreams();
      const httpClient = HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json(request.method === "GET" ? evaluation : mutation),
          ),
        ),
      );
      const context = makeWorkspaceHandlerTestContext({
        httpClient,
        screenLayer: humanScreenLayer(streams),
        wsOptions: { projectRoot: root },
      });
      const services = Layer.mergeAll(
        context.fullLayer,
        AuthClientTest(),
        AuthLoginInteractionTest().layer,
      );
      return Effect.gen(function* () {
        yield* handleVisibilitySet(target, "private");
        const stdout = streams.lines("stdout").join("\n");
        expect(stdout).toContain(target);
        expect(stdout).toContain(
          result === "changed" ? "from public to private" : "already private",
        );
        expect(stdout).toContain("revision-after-write");
      }).pipe(Effect.provide(services));
    });
  }
});
