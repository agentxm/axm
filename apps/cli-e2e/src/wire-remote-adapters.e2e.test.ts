import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { defineExecutionBinding } from "@agentxm/specification-metadata";
import {
  makeEnvironmentProcessFixture,
  withEnvironmentRegistry,
} from "./test-support/environment-process-fixture.js";

export const executionBinding = defineExecutionBinding({
  requirements: ["cli/machine-output/publishes-route-result-schemas"],
  boundary: "process",
  rationale:
    "A controlled HTTP Registry acknowledges actual token and lifecycle requests, while the built CLI emits independently asserted results that the shared harness validates against its discovered whole-stdout schemas.",
});

const parse = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);
const target = "@acme/skills/review";

describe("Remote adapters emit their declared wire results", () => {
  it("lists a page and reports only the acknowledged token revocation", async () => {
    const fixture = makeEnvironmentProcessFixture();
    const tokenId = "tok_00000000000000000000000000";
    const token = {
      id: tokenId,
      name: "fixture",
      type: "pat",
      permissions: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2030-01-01T00:00:00.000Z",
      lastUsedAt: null,
    };
    try {
      await withEnvironmentRegistry(
        (requestPath, request) => {
          if (request.method === "GET" && requestPath.startsWith("/v1/tokens"))
            return { body: JSON.stringify({ tokens: [token], cursor: null, hasMore: false }) };
          if (request.method === "DELETE" && requestPath === `/v1/tokens/${tokenId}`)
            return { status: 204, body: "" };
          return { status: 500, body: "Unexpected fixture request" };
        },
        async (origin, _requests, observations) => {
          fixture.writeProjectSettings({
            defaultRegistry: "fixture",
            sources: [{ name: "fixture", type: "registry", location: origin }],
          });
          const environment = { AXM_TOKEN: "wire-adapter-token" };
          const page = await fixture.run(["token", "list", "--json"], environment);
          expect(page.exitCode, page.stdout + page.stderr).toBe(0);
          expect(parse(page.stdout)).toMatchObject({
            ok: true,
            mode: "query",
            outcome: "completed",
            result: { items: [token], count: 1, cursor: null, hasMore: false },
          });
          const revoked = await fixture.run(["token", "revoke", tokenId, "--json"], environment);
          expect(revoked.exitCode, revoked.stdout + revoked.stderr).toBe(0);
          expect(parse(revoked.stdout)).toMatchObject({
            ok: true,
            mode: "apply",
            outcome: "applied",
            result: { status: "revoked", tokenId },
          });
          expect(observations.map(({ method, path }) => ({ method, path }))).toEqual([
            { method: "GET", path: "/v1/tokens" },
            { method: "DELETE", path: `/v1/tokens/${tokenId}` },
          ]);
        },
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("retains visibility findings and the acknowledged archival transition", async () => {
    const fixture = makeEnvironmentProcessFixture();
    const archival = { archivedAt: "2026-09-19T00:00:00.000Z", message: "Retired fixture" };
    const evaluation = {
      target,
      intent: null,
      request: null,
      resolved: null,
      actual: { value: "public", revision: "before" },
      comparison: "unconfigured",
      findings: [
        {
          code: "visibility/intent-required",
          severity: "warning",
          message: "Repository visibility is not configured.",
        },
      ],
    };
    try {
      await withEnvironmentRegistry(
        (requestPath, request) => {
          if (requestPath.endsWith("/visibility") && request.method === "GET")
            return { body: JSON.stringify(evaluation) };
          if (requestPath.endsWith("/archival") && request.method === "GET")
            return { body: JSON.stringify({ archival: null, revision: "before" }) };
          if (requestPath.endsWith("/archival") && request.method === "PUT")
            return {
              body: JSON.stringify({
                target,
                before: null,
                after: archival,
                disposition: "created",
                revision: "after",
              }),
            };
          return { status: 500, body: "Unexpected fixture request" };
        },
        async (origin, _requests, observations) => {
          fixture.writeProjectSettings({
            owner: "@acme",
            defaultRegistry: "fixture",
            sources: [{ name: "fixture", type: "registry", location: origin }],
          });
          const environment = { AXM_TOKEN: "wire-adapter-token" };
          const status = await fixture.run(["visibility", "status", target, "--json"], environment);
          expect(status.exitCode, status.stdout + status.stderr).toBe(0);
          expect(parse(status.stdout)).toMatchObject({
            ok: true,
            mode: "query",
            outcome: "completed",
            result: evaluation,
          });
          const archived = await fixture.run(
            ["archive", target, "--message", archival.message, "--json"],
            environment,
          );
          expect(archived.exitCode, archived.stdout + archived.stderr).toBe(0);
          expect(parse(archived.stdout)).toMatchObject({
            ok: true,
            mode: "apply",
            outcome: "applied",
            result: {
              contract: "registry-transition-v1",
              action: "archive",
              fqn: target,
              before: null,
              after: archival,
              revision: "after",
              disposition: "changed",
              restorable: false,
            },
          });
          expect(
            observations.map(({ method, path }) => ({ method, endpoint: path.split("/").at(-1) })),
          ).toEqual([
            { method: "GET", endpoint: "visibility" },
            { method: "GET", endpoint: "archival" },
            { method: "PUT", endpoint: "archival" },
          ]);
        },
      );
    } finally {
      fixture.cleanup();
    }
  });
});
