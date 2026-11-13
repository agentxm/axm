import * as http from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as Schema from "effect/Schema";
import { createBinaryRunner, createTempDir } from "@agentxm/client-e2e-utils";
import { describe, expect, it } from "vitest";
import { resolveBinaryPath } from "./distribution-targets.js";

// Every failing invocation owns a fresh diagnostic UUID, independently of tracing.
// Retain the complete output and label while normalizing only that identity.
const diagnosticIdentity = /(Diagnostic ID[ \t]+)[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/g;
const stableDiagnosticOutput = (output: string, succeeds: boolean) => {
  expect([...output.matchAll(diagnosticIdentity)]).toHaveLength(succeeds ? 0 : 1);
  return output.replace(diagnosticIdentity, "$1<invocation-id>");
};

export const executionBinding = {
  requirements: [
    "cli/local-tracing-describes-operation-work",
    "cli/local-tracing-stays-local-and-private",
    "cli/local-tracing-preserves-outcomes",
    "cli/local-tracing-identifies-invocations",
  ],
  boundary: "binary",
  rationale:
    "Runs the compiled CLI with a real local collector, checks disabled and enabled export, verifies stdout/stderr/exit equivalence, and proves ambient proxy settings do not redirect diagnostic traffic.",
} as const;

describe("compiled local tracing", () => {
  it("keeps successful and failed output unchanged and exports only when explicitly activated", async () => {
    const root = createTempDir();
    const payloads: string[] = [];
    let behavior: "ok" | "reject" | "stall" = "ok";
    const server = http.createServer((request, response) => {
      if (request.method !== "POST") {
        response.writeHead(404).end();
        return;
      }
      expect(request.headers["content-type"]).toBe("application/x-protobuf");
      let body = "";
      request.on("data", (chunk: unknown) => {
        body += String(chunk);
      });
      request.on("end", () => {
        payloads.push(body);
        if (behavior === "stall") return;
        response
          .writeHead(behavior === "reject" ? 503 : 200, { "content-type": "application/json" })
          .end("{}");
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = server.address();
      if (address === null || typeof address === "string")
        throw new Error("Missing local collector");
      const endpoint = `http://127.0.0.1:${address.port}/v1/traces`;
      const run = createBinaryRunner(resolveBinaryPath());
      const environment = {
        AXM_USER_HOME: root.path,
        AXM_TELEMETRY: "0",
        AXM_NO_UPDATE_CHECK: "1",
        AXM_TRACE_ENDPOINT: endpoint,
        OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
        // A real direct connection must still reach the collector with these set.
        HTTP_PROXY: "http://127.0.0.1:1",
        HTTPS_PROXY: "http://127.0.0.1:1",
        ALL_PROXY: "http://127.0.0.1:1",
        NO_PROXY: "",
        NODE_USE_ENV_PROXY: "1",
      };
      for (const { args, succeeds } of [
        { args: ["--version"], succeeds: true },
        { args: ["--version", "--plain"], succeeds: false },
      ]) {
        const before = payloads.length;
        const baseline = await run(args, {
          cwd: root.path,
          env: { ...environment, AXM_TRACE: "" },
        });
        expect(baseline.exitCode === 0).toBe(succeeds);
        expect(payloads).toHaveLength(before);
        const receiptPath = join(
          root.path,
          succeeds ? "success-receipt.json" : "failure-receipt.json",
        );
        const traced = await run(args, {
          cwd: root.path,
          env: { ...environment, AXM_TRACE: "1", AXM_TRACE_RECEIPT: receiptPath },
        });
        const receiptBytes = readFileSync(receiptPath);
        const receiptText = receiptBytes.toString("utf8");
        const receipt = (() => {
          try {
            return Schema.decodeUnknownSync(
              Schema.fromJsonString(
                Schema.Struct({
                  schemaVersion: Schema.Literal(2),
                  service: Schema.Literal("axm"),
                  producerComplete: Schema.Literal(true),
                  aggregateEventCount: Schema.Int,
                  aggregateEventsSha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
                  droppedAggregateEventCount: Schema.Literal(0),
                  traceId: Schema.String,
                  spanId: Schema.String,
                }),
              ),
            )(receiptText);
          } catch (cause) {
            // The fixture is removed below. Preserve the exact receipt and process
            // result in the failure report before losing that diagnostic evidence.
            throw new Error(
              `Invalid trace receipt: ${JSON.stringify({
                args,
                exitCode: traced.exitCode,
                stdout: traced.stdout,
                stderr: traced.stderr,
                receiptText,
                receiptBytesBase64: receiptBytes.toString("base64"),
              })}`,
              { cause },
            );
          }
        })();
        expect(receipt.traceId).toMatch(/^[0-9a-f]{32}$/);
        expect(receipt.spanId).toMatch(/^[0-9a-f]{16}$/);
        expect(traced.exitCode).toBe(baseline.exitCode);
        expect(traced.stdout).toBe(baseline.stdout);
        expect(stableDiagnosticOutput(traced.stderr, succeeds)).toBe(
          stableDiagnosticOutput(baseline.stderr, succeeds),
        );
        expect(payloads.length).toBeGreaterThan(before);
        for (const failedCollector of ["reject", "stall"] as const) {
          behavior = failedCollector;
          const rejected = await run(args, {
            cwd: root.path,
            env: { ...environment, AXM_TRACE: "1" },
          });
          expect(rejected.exitCode).toBe(baseline.exitCode);
          expect(rejected.stdout).toBe(baseline.stdout);
          expect(stableDiagnosticOutput(rejected.stderr, succeeds)).toBe(
            stableDiagnosticOutput(baseline.stderr, succeeds),
          );
        }
        behavior = "ok";
      }
      expect(payloads.join("")).toContain("axm.cli.invocation");
      expect(payloads.join("")).not.toContain(root.path);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
      root.cleanup();
    }
  });
});
