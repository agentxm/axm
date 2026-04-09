// @effect-diagnostics nodeBuiltinImport:off — subprocess smoke tests run the source entrypoint
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import * as path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { JsonHelpDocSchema } from "./formatter.js";
import { PetsListOutputSchema } from "./root/pets/list.js";
import { OutputsDetailOutputSchema } from "./root/outputs/detail.js";
import { OutputsRawOutputSchema } from "./root/outputs/raw.js";
import { OutputsResultOutputSchema } from "./root/outputs/result.js";
import { OutputsTableOutputSchema } from "./root/outputs/table.js";
import { OutputsTreeOutputSchema } from "./root/outputs/tree.js";

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

interface ErrorRequestBody {
  readonly errors: ReadonlyArray<{ readonly message: string; readonly name: string }>;
  readonly level: string;
  readonly handled: boolean;
  readonly context: { readonly command: string };
}

const decodeJsonHelp = Schema.decodeUnknownSync(JsonHelpDocSchema);
const decodePetsListOutput = Schema.decodeUnknownSync(PetsListOutputSchema);
const decodeOutputsDetail = Schema.decodeUnknownSync(OutputsDetailOutputSchema);
const decodeOutputsRaw = Schema.decodeUnknownSync(OutputsRawOutputSchema);
const decodeOutputsResult = Schema.decodeUnknownSync(OutputsResultOutputSchema);
const decodeOutputsTable = Schema.decodeUnknownSync(OutputsTableOutputSchema);
const decodeOutputsTree = Schema.decodeUnknownSync(OutputsTreeOutputSchema);

const combinedOutput = (result: CliResult): string => result.stdout + result.stderr;

const expectErrorRequestBody = (value: unknown): ErrorRequestBody => {
  if (typeof value !== "object" || value === null) {
    throw new Error("Expected telemetry error request body");
  }

  if (
    !("errors" in value) ||
    !Array.isArray(value.errors) ||
    value.errors.some(
      (entry) =>
        typeof entry !== "object" ||
        entry === null ||
        !("message" in entry) ||
        typeof entry.message !== "string" ||
        !("name" in entry) ||
        typeof entry.name !== "string",
    )
  ) {
    throw new Error("Expected telemetry errors array");
  }

  if (
    !("level" in value) ||
    typeof value.level !== "string" ||
    !("handled" in value) ||
    typeof value.handled !== "boolean" ||
    !("context" in value) ||
    typeof value.context !== "object" ||
    value.context === null ||
    !("command" in value.context) ||
    typeof value.context.command !== "string"
  ) {
    throw new Error("Expected telemetry error metadata");
  }

  return {
    errors: value.errors.map((entry) => ({
      message: entry.message,
      name: entry.name,
    })),
    level: value.level,
    handled: value.handled,
    context: {
      command: value.context.command,
    },
  };
};

const runSpike = (
  args: ReadonlyArray<string>,
  env: Record<string, string> = {},
): Promise<CliResult> =>
  new Promise((resolve, reject) => {
    const child = spawn("bun", ["run", CLI_PATH, ...args], {
      cwd: PACKAGE_ROOT,
      env: { ...process.env, AXM_TELEMETRY: "0", ...env, NO_COLOR: "1" },
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
        body: body.length > 0 ? JSON.parse(body) : undefined,
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

describe("axm-spike source smoke", () => {
  it("shows root help from source", async () => {
    const result = await runSpike(["--help"]);
    const output = combinedOutput(result);

    expect(result.exitCode).toBe(0);
    expect(output).toContain("axm-spike");
    expect(output).toContain("pets");
    expect(output).toContain("prompts");
    expect(output).toContain("outputs");
    expect(output).toContain("telemetry");
    expect(output).toContain("--json");
    expect(output).not.toContain("--completions");
    expect(output).not.toContain("--log-level");
  });

  it("keeps only --json visible on supported leaf help", async () => {
    const result = await runSpike(["pets", "list", "--help"]);
    const output = combinedOutput(result);

    expect(result.exitCode).toBe(0);
    expect(output).toContain("--json");
    expect(output).toContain("items[]");
    expect(output).toContain("count");
  });

  it("keeps only --json visible on unsupported leaf help", async () => {
    const result = await runSpike(["pets", "intake", "--help"]);
    const output = combinedOutput(result);

    expect(result.exitCode).toBe(0);
    expect(output).toContain("--json");
  });

  it("formats help as JSON before Effect runs", async () => {
    const result = await runSpike(["pets", "list", "--json", "--help"]);
    const output = decodeJsonHelp(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(output.usage).toContain("axm-spike pets list");
    expect(output.globalFlags?.map((flag) => flag.name)).toEqual(["json"]);
  });

  it("allows --json on non-document commands without emitting stdout data", async () => {
    const result = await runSpike(["outputs", "box", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("This box renders one message at a time.");
  });

  it("emits the published items document for pets list", async () => {
    const result = await runSpike(["pets", "list", "--json"]);
    const output = decodePetsListOutput(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(output.command).toBe("pets.list");
    expect(output.count).toBeGreaterThan(0);
    expect(output.items[0]?.name).toBeDefined();
  });

  it("emits the published document for outputs raw", async () => {
    const result = await runSpike(["outputs", "raw", "--json"]);
    const output = decodeOutputsRaw(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(output.command).toBe("outputs.raw");
    expect(output.data.lines).toContain("Name: axm-spike");
  });

  it("emits the published document for outputs detail", async () => {
    const result = await runSpike(["outputs", "detail", "--json"]);
    const output = decodeOutputsDetail(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(output.command).toBe("outputs.detail");
    expect(output.data.name).toBe("Mochi");
    expect(output.data.habitat).toBe("showroom");
  });

  it("emits the published document for outputs table", async () => {
    const result = await runSpike(["outputs", "table", "--json"]);
    const output = decodeOutputsTable(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(output.command).toBe("outputs.table");
    expect(output.count).toBe(4);
    expect(output.items[0]?.name).toBe("Mochi");
  });

  it("emits the stable stream document for outputs result", async () => {
    const result = await runSpike(["outputs", "result", "--stream", "--json"]);
    const output = decodeOutputsResult(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(output.command).toBe("outputs.result");
    expect(output.count).toBe(3);
    expect(output.data.kind).toBe("list");
    if (output.data.kind !== "list") {
      throw new Error("Expected the list variant for --stream output");
    }
    expect(output.data.items[0]?.name).toBe("Mochi");
  });

  it("emits the recursive document for outputs tree", async () => {
    const result = await runSpike(["outputs", "tree", "--json"]);
    const output = decodeOutputsTree(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(output.command).toBe("outputs.tree");
    expect(output.data.roots[0]?.name).toBe("packages");
    expect(output.data.roots[0]?.children?.[0]?.children?.[0]?.name).toBe("src");
  });
});

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
      const body = expectErrorRequestBody(request.body);

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
      const body = expectErrorRequestBody(request.body);

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
