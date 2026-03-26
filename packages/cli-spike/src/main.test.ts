import { spawn } from "node:child_process";
import { createServer } from "node:http";
import * as path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it } from "vitest";

const CLI_PATH = path.resolve(import.meta.dirname, "main.ts");
const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface CapturedRequest {
  readonly url: string;
  readonly body: unknown;
}

interface CaptureServer {
  readonly baseUrl: string;
  readonly captured: Array<CapturedRequest>;
  readonly close: () => Promise<void>;
}

const runSpike = (args: ReadonlyArray<string>, env: Record<string, string>): Promise<CliResult> =>
  new Promise((resolve, reject) => {
    const child = spawn("bun", ["run", CLI_PATH, ...args], {
      cwd: PACKAGE_ROOT,
      env: { ...process.env, ...env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Timed out running axm-spike ${args.join(" ")}`));
    }, 30_000);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });

const startCaptureServer = async (): Promise<CaptureServer> => {
  const captured: Array<CapturedRequest> = [];
  const server = createServer((req, res) => {
    let body = "";

    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      captured.push({
        url: req.url ?? "/",
        body: body.length > 0 ? (JSON.parse(body) as unknown) : undefined,
      });
      res.statusCode = 202;
      res.end("");
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to start telemetry capture server");
  }

  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    captured,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
};

const waitForErrorRequest = async (server: CaptureServer): Promise<CapturedRequest> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const request = server.captured.find((entry) => entry.url === "/v1/errors");
    if (request !== undefined) {
      return request;
    }
    await sleep(25);
  }

  throw new Error("Timed out waiting for telemetry error request");
};

describe("axm-spike telemetry demos", () => {
  it("reports handled AppError telemetry", async () => {
    const server = await startCaptureServer();

    try {
      const result = await runSpike(["telemetry", "handled"], {
        AXM_TELEMETRY: "errors",
        AXM_TELEMETRY_BASE_URL: server.baseUrl,
        AXM_TELEMETRY_ENABLE_IN_TEST: "true",
      });
      const request = await waitForErrorRequest(server);
      // Assertion needed: test boundary — narrowing captured JSON body for assertions
      const body = request.body as unknown as {
        errors: ReadonlyArray<{ message: string; name: string }>;
        level: string;
        handled: boolean;
        context: { command: string };
      };

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Simulated handled telemetry failure");
      expect(request.url).toBe("/v1/errors");
      expect(body.errors[0]).toEqual({
        name: "SPIKE_HANDLED_ERROR",
        message: "Simulated handled telemetry failure",
      });
      expect(body.level).toBe("error");
      expect(body.handled).toBe(true);
      expect(body.context.command).toBe("telemetry handled");
    } finally {
      await server.close();
    }
  });

  it("reports defect telemetry for unhandled failures", async () => {
    const server = await startCaptureServer();

    try {
      const result = await runSpike(["telemetry", "defect"], {
        AXM_TELEMETRY: "errors",
        AXM_TELEMETRY_BASE_URL: server.baseUrl,
        AXM_TELEMETRY_ENABLE_IN_TEST: "true",
      });
      const request = await waitForErrorRequest(server);
      // Assertion needed: test boundary — narrowing captured JSON body for assertions
      const body = request.body as unknown as {
        errors: ReadonlyArray<{ message: string; name: string }>;
        level: string;
        handled: boolean;
        context: { command: string };
      };

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Simulated defect telemetry failure");
      expect(request.url).toBe("/v1/errors");
      expect(body.errors[0]).toEqual({
        name: "Defect",
        message: "Simulated defect telemetry failure",
      });
      expect(body.level).toBe("fatal");
      expect(body.handled).toBe(false);
      expect(body.context.command).toBe("telemetry defect");
    } finally {
      await server.close();
    }
  });
});

describe("axm-spike cli-spike services", () => {
  it("provides FakeSkillsManager through withRuntime", async () => {
    const result = await runSpike(["skills", "list", "--scope", "project"], {
      AXM_TELEMETRY: "0",
    });
    const combined = result.stdout + result.stderr;

    expect(result.exitCode).toBe(0);
    expect(combined).toContain("FakeSkillsManager: listing project demo skills");
    expect(combined).toContain("pr-review");
  });
});
