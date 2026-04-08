// @effect-diagnostics nodeBuiltinImport:off — subprocess E2E test, node builtins are the correct tool
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

interface ErrorRequestBody {
  readonly errors: ReadonlyArray<{ readonly message: string; readonly name: string }>;
  readonly level: string;
  readonly handled: boolean;
  readonly context: { readonly command: string };
}

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

describe("axm-spike group help", () => {
  const cases = [
    {
      args: ["pets"],
      expected: ["list", "intake", "register", "adopt", "axm-spike pets adopt Mochi --preview"],
    },
    {
      args: ["prompts"],
      expected: [
        "text",
        "password",
        "confirm",
        "integer",
        "date",
        "toggle",
        "list",
        "hidden",
        "composition",
        "autocomplete-multiselect",
        "axm-spike prompts confirm --answer yes",
      ],
    },
    {
      args: ["outputs"],
      expected: ["log", "box", "result", "raw", "axm-spike outputs raw --json"],
    },
    {
      args: ["telemetry"],
      expected: ["handled", "defect", "axm-spike telemetry handled"],
    },
  ] as const;

  for (const testCase of cases) {
    it(`shows help for ${testCase.args.join(" ")}`, async () => {
      const result = await runSpike(testCase.args);
      const output = combinedOutput(result);

      expect(result.exitCode).toBe(0);
      for (const expected of testCase.expected) {
        expect(output).toContain(expected);
      }
    });
  }
});

describe("axm-spike leaf help", () => {
  const cases = [
    { args: ["pets", "list", "--help"], expected: "axm-spike pets list --json" },
    {
      args: ["pets", "intake", "--help"],
      expected: "axm-spike pets intake partner-feed --all --yes",
    },
    {
      args: ["pets", "register", "--help"],
      expected: "axm-spike pets register Mochi --tag shy --tag lap-cat",
    },
    { args: ["pets", "adopt", "--help"], expected: "axm-spike pets adopt Juniper --force --yes" },
    { args: ["prompts", "text", "--help"], expected: "axm-spike prompts text --value Mochi" },
    {
      args: ["prompts", "password", "--help"],
      expected: "axm-spike prompts password --value secret123",
    },
    { args: ["prompts", "confirm", "--help"], expected: "axm-spike prompts confirm --answer yes" },
    {
      args: ["prompts", "path", "--help"],
      expected: "axm-spike prompts path --value ./records",
    },
    { args: ["prompts", "select", "--help"], expected: "axm-spike prompts select --value cat" },
    {
      args: ["prompts", "multiselect", "--help"],
      expected: "axm-spike prompts multiselect --value vaccination --value microchip",
    },
    {
      args: ["prompts", "group-multiselect", "--help"],
      expected: "axm-spike prompts group-multiselect --value vaccination --value bath",
    },
    {
      args: ["prompts", "select-key", "--help"],
      expected: "axm-spike prompts select-key --value adopt",
    },
    {
      args: ["prompts", "autocomplete", "--help"],
      expected: "axm-spike prompts autocomplete --value Mochi",
    },
    {
      args: ["prompts", "autocomplete-multiselect", "--help"],
      expected: "axm-spike prompts autocomplete-multiselect --value vaccination --value dental",
    },
    { args: ["prompts", "integer", "--help"], expected: "axm-spike prompts integer --value 24" },
    { args: ["prompts", "date", "--help"], expected: "axm-spike prompts date --value 2026-04-08" },
    { args: ["prompts", "toggle", "--help"], expected: "axm-spike prompts toggle --value yes" },
    {
      args: ["prompts", "list", "--help"],
      expected: "axm-spike prompts list --value friendly --value house-trained",
    },
    {
      args: ["prompts", "hidden", "--help"],
      expected: "axm-spike prompts hidden --value secret123",
    },
    {
      args: ["prompts", "composition", "--help"],
      expected:
        "axm-spike prompts composition --name Mochi --species cat --age 24 --adoptable yes --habitat showroom",
    },
    {
      args: ["outputs", "log", "--help"],
      expected: 'axm-spike outputs log "Lint passed" --level success',
    },
    { args: ["outputs", "intro", "--help"], expected: 'axm-spike outputs intro "Workspace ready"' },
    {
      args: ["outputs", "note", "--help"],
      expected: 'axm-spike outputs note "Read the deploy checklist" --title Reminder',
    },
    {
      args: ["outputs", "box", "--help"],
      expected: 'axm-spike outputs box "Release ready" --title Status --rounded',
    },
    {
      args: ["outputs", "spinner", "--help"],
      expected: 'axm-spike outputs spinner "Downloading registry index"',
    },
    {
      args: ["outputs", "progress", "--help"],
      expected: 'axm-spike outputs progress "Publishing packages" --max 5',
    },
    {
      args: ["outputs", "task-log", "--help"],
      expected: 'axm-spike outputs task-log "Publishing docs" --limit 3',
    },
    { args: ["outputs", "run-tasks", "--help"], expected: "axm-spike outputs run-tasks" },
    {
      args: ["outputs", "table", "--help"],
      expected: 'axm-spike outputs table --caption "Adoptable pets"',
    },
    {
      args: ["outputs", "detail", "--help"],
      expected: 'axm-spike outputs detail --title "Featured pet"',
    },
    { args: ["outputs", "tree", "--help"], expected: "axm-spike outputs tree --title Workspace" },
    {
      args: ["outputs", "stream-log", "--help"],
      expected: "axm-spike outputs stream-log --level warn",
    },
    { args: ["outputs", "result", "--help"], expected: "axm-spike outputs result --json" },
    { args: ["outputs", "raw", "--help"], expected: "axm-spike outputs raw --json" },
    { args: ["telemetry", "handled", "--help"], expected: "axm-spike telemetry handled" },
    { args: ["telemetry", "defect", "--help"], expected: "axm-spike telemetry defect" },
  ] as const;

  for (const testCase of cases) {
    it(`includes examples for ${testCase.args.slice(0, -1).join(" ")}`, async () => {
      const result = await runSpike(testCase.args);
      const output = combinedOutput(result);

      expect(result.exitCode).toBe(0);
      expect(output).toContain(testCase.expected);
    });
  }
});

describe("axm-spike json output", () => {
  it("shows --json on supported help and hides it on unsupported help", async () => {
    const supported = await runSpike(["pets", "list", "--help"]);
    const unsupported = await runSpike(["pets", "intake", "--help"]);

    expect(combinedOutput(supported)).toContain("--json");
    expect(combinedOutput(unsupported)).not.toContain("--json");
  });

  it("formats help as JSON before Effect runs", async () => {
    const result = await runSpike(["pets", "list", "--json", "--help"]);
    const output = JSON.parse(result.stdout) as {
      type: string;
      usage: string;
      examples?: Array<unknown>;
    };

    expect(result.exitCode).toBe(0);
    expect(output.type).toBe("help");
    expect(output.usage).toContain("axm-spike pets list");
    expect(output.examples?.length).toBeGreaterThan(0);
  });

  it("rejects --json on unsupported commands", async () => {
    const result = await runSpike(["outputs", "log", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("JSON_OUTPUT_UNSUPPORTED");
  });

  it("emits a structured document for pets list", async () => {
    const result = await runSpike(["pets", "list", "--json"]);
    const output = JSON.parse(result.stdout) as {
      command: string;
      count: number;
      items: ReadonlyArray<{ name: string }>;
    };

    expect(result.exitCode).toBe(0);
    expect(output.command).toBe("pets.list");
    expect(output.count).toBeGreaterThan(0);
    expect(output.items[0]?.name).toBeDefined();
  });

  it("emits a structured document for outputs result", async () => {
    const result = await runSpike(["outputs", "result", "--json"]);
    const output = JSON.parse(result.stdout) as {
      command: string;
      data: { name: string };
    };

    expect(result.exitCode).toBe(0);
    expect(output.command).toBe("outputs.result");
    expect(output.data.name).toBe("Mochi");
  });

  it("emits a structured document for outputs raw", async () => {
    const result = await runSpike(["outputs", "raw", "--json"]);
    const output = JSON.parse(result.stdout) as {
      command: string;
      data: { lines: ReadonlyArray<string> };
    };

    expect(result.exitCode).toBe(0);
    expect(output.command).toBe("outputs.raw");
    expect(output.data.lines.length).toBeGreaterThan(0);
  });
});

describe("axm-spike prompt commands", () => {
  const successCases = [
    {
      args: ["prompts", "text", "--non-interactive", "--value", "hello"],
      expected: "You entered: hello",
    },
    {
      args: ["prompts", "password", "--non-interactive", "--value", "hunter2"],
      expected: "Secret received",
    },
    {
      args: ["prompts", "confirm", "--non-interactive", "--answer", "yes"],
      expected: "You chose: Yes",
    },
    {
      args: ["prompts", "path", "--non-interactive", "--value", "./packages/cli-spike"],
      expected: "Selected path: ./packages/cli-spike",
    },
    {
      args: ["prompts", "select", "--non-interactive", "--value", "cat"],
      expected: "You picked: cat",
    },
    {
      args: [
        "prompts",
        "multiselect",
        "--non-interactive",
        "--value",
        "vaccination",
        "--value",
        "microchip",
      ],
      expected: "vaccination, microchip",
    },
    {
      args: [
        "prompts",
        "group-multiselect",
        "--non-interactive",
        "--value",
        "vaccination",
        "--value",
        "bath",
      ],
      expected: "vaccination, bath",
    },
    {
      args: ["prompts", "select-key", "--non-interactive", "--value", "adopt"],
      expected: "You chose: adopt",
    },
    {
      args: ["prompts", "autocomplete", "--non-interactive", "--value", "Mochi"],
      expected: "Selected: Mochi",
    },
    {
      args: [
        "prompts",
        "autocomplete-multiselect",
        "--non-interactive",
        "--value",
        "vaccination",
        "--value",
        "dental",
      ],
      expected: "vaccination, dental",
    },
    {
      args: ["prompts", "integer", "--non-interactive", "--value", "24"],
      expected: "Pet age: 24 months",
    },
    {
      args: ["prompts", "date", "--non-interactive", "--value", "2026-04-08"],
      expected: "Intake date: 2026-04-08",
    },
    {
      args: ["prompts", "toggle", "--non-interactive", "--value", "yes"],
      expected: "Adoptable: yes",
    },
    {
      args: [
        "prompts",
        "list",
        "--non-interactive",
        "--value",
        "friendly",
        "--value",
        "house-trained",
      ],
      expected: "Tags: friendly, house-trained",
    },
    {
      args: ["prompts", "hidden", "--non-interactive", "--value", "secret123"],
      expected: "Code received",
    },
    {
      args: [
        "prompts",
        "composition",
        "--non-interactive",
        "--name",
        "Mochi",
        "--species",
        "cat",
        "--age",
        "24",
        "--adoptable",
        "yes",
        "--habitat",
        "showroom",
      ],
      expected: "Registered: Mochi",
    },
  ] as const;

  for (const testCase of successCases) {
    it(`supports non-interactive fallback for ${testCase.args.slice(0, 2).join(" ")}`, async () => {
      const result = await runSpike(testCase.args);

      expect(result.exitCode).toBe(0);
      expect(combinedOutput(result)).toContain(testCase.expected);
    });
  }

  it("fails clearly when non-interactive input is missing", async () => {
    const result = await runSpike(["prompts", "password", "--non-interactive"]);

    expect(result.exitCode).toBe(1);
    expect(combinedOutput(result)).toContain("PROMPT_REQUIRED");
    expect(combinedOutput(result)).toContain("Interactive prompt required");
    expect(combinedOutput(result)).toContain("Pass the value via a flag");
  });

  it("allows non-interactive composition without habitat when adoptable is no", async () => {
    const result = await runSpike([
      "prompts",
      "composition",
      "--non-interactive",
      "--name",
      "Juniper",
      "--species",
      "dog",
      "--age",
      "18",
      "--adoptable",
      "no",
    ]);

    expect(result.exitCode).toBe(0);
    expect(combinedOutput(result)).toContain("Registered: Juniper");
    expect(combinedOutput(result)).toContain("Habitat: pending");
  });

  it("requires habitat for adoptable pets in non-interactive composition mode", async () => {
    const result = await runSpike([
      "prompts",
      "composition",
      "--non-interactive",
      "--name",
      "Juniper",
      "--species",
      "dog",
      "--age",
      "18",
      "--adoptable",
      "yes",
    ]);

    expect(result.exitCode).toBe(1);
    expect(combinedOutput(result)).toContain("PROMPT_REQUIRED");
    expect(combinedOutput(result)).toContain("Select habitat:");
  });
});

describe("axm-spike pet commands", () => {
  it("lists sample pets through the runtime service layer", async () => {
    const result = await runSpike(["pets", "list", "--habitat", "showroom"]);
    const output = combinedOutput(result);

    expect(result.exitCode).toBe(0);
    expect(output).toContain("Mochi");
    expect(output).toContain("Pickles");
  });

  it("requires confirmation for intake in non-interactive mode unless --yes is set", async () => {
    const blocked = await runSpike(["pets", "intake", "partner-feed", "--non-interactive"]);
    const allowed = await runSpike([
      "pets",
      "intake",
      "partner-feed",
      "--non-interactive",
      "--yes",
    ]);

    expect(blocked.exitCode).toBe(1);
    expect(combinedOutput(blocked)).toContain("PROMPT_REQUIRED");
    expect(allowed.exitCode).toBe(0);
    expect(combinedOutput(allowed)).toContain("Logged intake");
  });

  it("enforces force/yes/preview semantics for adoption", async () => {
    const preview = await runSpike(["pets", "adopt", "Mochi", "--preview", "--non-interactive"]);
    const blocked = await runSpike(["pets", "adopt", "Juniper", "--yes"]);
    const forced = await runSpike(["pets", "adopt", "Juniper", "--force", "--yes"]);

    expect(preview.exitCode).toBe(0);
    expect(combinedOutput(preview)).toContain("Preview only");
    expect(blocked.exitCode).toBe(1);
    expect(blocked.stderr).toContain("not currently marked adoptable");
    expect(forced.exitCode).toBe(0);
    expect(combinedOutput(forced)).toContain("Force applied: yes");
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
