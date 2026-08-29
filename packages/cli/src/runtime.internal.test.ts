import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "@effect/vitest";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { afterEach, beforeEach } from "vitest";

import {
  getBuiltInSources,
  makeCliLoggerLayer,
  resolveBuiltInRegistryLocation,
  withAxmUserAgent,
  withWorkspace,
} from "./runtime.js";
import { makeWorkspaceHandlerTestContext } from "./test-helpers.js";

describe("getBuiltInSources", () => {
  it("defines exactly the four accepted built-in source names and types", () => {
    expect(getBuiltInSources("https://registry.agentxm.ai")).toEqual([
      {
        name: "agentxm",
        type: "registry",
        location: new URL("https://registry.agentxm.ai"),
      },
      { name: "github", type: "github", url: new URL("https://github.com") },
      { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
      { name: "bitbucket", type: "bitbucket", url: new URL("https://bitbucket.org") },
    ]);
  });
});

describe("resolveBuiltInRegistryLocation", () => {
  it("prefers AXM_REGISTRY_LOCATION when set to a remote URL", () => {
    const location = resolveBuiltInRegistryLocation(
      { AXM_REGISTRY_LOCATION: "https://registry.example.test" },
      "https://registry.agentxm.ai",
    );

    expect(location).toBe("https://registry.example.test/");
  });

  it("normalizes filesystem paths to file URLs", () => {
    const registryPath = path.join(process.cwd(), "tmp", "registry");
    const location = resolveBuiltInRegistryLocation(
      { AXM_REGISTRY_LOCATION: registryPath },
      "https://registry.agentxm.ai",
    );

    expect(location).toBe(pathToFileURL(registryPath).href);
  });

  it("falls back to AXM_REGISTRY_URL when AXM_REGISTRY_LOCATION is unset", () => {
    const location = resolveBuiltInRegistryLocation({}, "https://registry.example.test");

    expect(location).toBe("https://registry.example.test/");
  });

  it("treats an empty AXM_REGISTRY_LOCATION as unset", () => {
    const location = resolveBuiltInRegistryLocation(
      { AXM_REGISTRY_LOCATION: "" },
      "https://registry.example.test",
    );

    expect(location).toBe("https://registry.example.test/");
  });
});

describe("withAxmUserAgent", () => {
  it.effect("adds the CLI name and version to every request", () =>
    Effect.gen(function* () {
      let observedUserAgent: string | undefined;
      const client = withAxmUserAgent(
        HttpClient.make((request) =>
          Effect.sync(() => {
            observedUserAgent = request.headers["user-agent"];
            return HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }));
          }),
        ),
        "1.2.3",
      );

      yield* client.execute(HttpClientRequest.get("https://registry.example.test"));

      expect(observedUserAgent).toBe("axm-cli/1.2.3");
    }),
  );
});

describe("makeCliLoggerLayer", () => {
  it.effect("routes debug diagnostics to stderr", () =>
    Effect.gen(function* () {
      const errors: Array<ReadonlyArray<unknown>> = [];
      const logs: Array<ReadonlyArray<unknown>> = [];
      const testConsole: Console.Console = {
        ...console,
        error: (...args: ReadonlyArray<unknown>) => errors.push(args),
        log: (...args: ReadonlyArray<unknown>) => logs.push(args),
      };

      yield* Effect.logDebug("machine-safe debug message").pipe(
        Effect.provideService(Console.Console, testConsole),
        Effect.provide(makeCliLoggerLayer("debug")),
      );

      expect(errors).toHaveLength(1);
      expect(logs).toHaveLength(0);
    }),
  );

  it.effect("emits warnings but suppresses debug diagnostics at normal verbosity", () =>
    Effect.gen(function* () {
      const errors: Array<ReadonlyArray<unknown>> = [];
      const testConsole: Console.Console = {
        ...console,
        error: (...args: ReadonlyArray<unknown>) => errors.push(args),
      };

      yield* Effect.gen(function* () {
        yield* Effect.logDebug("hidden debug message");
        yield* Effect.logWarning("visible warning message");
      }).pipe(
        Effect.provideService(Console.Console, testConsole),
        Effect.provide(makeCliLoggerLayer("normal")),
      );

      expect(errors).toHaveLength(1);
      expect(errors[0]?.join(" ")).toContain("visible warning message");
    }),
  );

  it.effect("emits machine-mode warnings as one typed JSON log event", () =>
    Effect.gen(function* () {
      const errors: Array<ReadonlyArray<unknown>> = [];
      const testConsole: Console.Console = {
        ...console,
        error: (...args: ReadonlyArray<unknown>) => errors.push(args),
      };

      yield* Effect.logWarning("OS keychain unavailable; using restricted credential file.").pipe(
        Effect.provideService(Console.Console, testConsole),
        Effect.provide(makeCliLoggerLayer("normal", "json")),
      );

      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual([
        JSON.stringify({
          type: "log",
          level: "warn",
          message: "OS keychain unavailable; using restricted credential file.",
        }),
      ]);
    }),
  );
});

describe("withWorkspace settings gate", () => {
  /**
   * AXM-EVAL-ARCH-PROJECT-WORKSPACE-CONSTRUCTION-GATE
   * AXM-EVAL-REQ-PROJECT-WORKSPACE-SETTINGS-VALIDITY
   */
  let tempDir: string;
  let projectDir: string;
  let userHome: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-settings-gate-"));
    projectDir = path.join(tempDir, "project");
    userHome = path.join(tempDir, "home");
    fs.mkdirSync(path.join(projectDir, ".axm"), { recursive: true });
    fs.mkdirSync(path.join(userHome, ".axm"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "axm.json"), JSON.stringify({ agents: [] }));
    fs.writeFileSync(path.join(projectDir, "axm-lock.yaml"), "lockfileVersion: 6\nskills: {}\n");
    process.chdir(projectDir);
    process.env["HOME"] = userHome;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome === undefined) delete process.env["HOME"];
    else process.env["HOME"] = originalHome;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const invalidSources = [
    { owner: "project", path: () => path.join(projectDir, "axm.json") },
    { owner: "user", path: () => path.join(userHome, ".axm", "workspace", "axm.json") },
  ] as const;

  for (const source of invalidSources) {
    it.effect(`does not evaluate the command when ${source.owner} settings are invalid`, () =>
      Effect.gen(function* () {
        fs.mkdirSync(path.dirname(source.path()), { recursive: true });
        fs.writeFileSync(source.path(), "{ not-json");
        let commandEvaluated = false;
        const testContext = makeWorkspaceHandlerTestContext();

        const error = yield* withWorkspace("project")(
          Effect.sync(() => {
            commandEvaluated = true;
          }),
        ).pipe(Effect.provide(testContext.baseLayer), Effect.flip);

        expect(error).toMatchObject({ _tag: "AppError", code: "validation" });
        expect(commandEvaluated).toBe(false);
      }),
    );
  }
});
