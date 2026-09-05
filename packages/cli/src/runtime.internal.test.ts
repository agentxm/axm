import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
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
import { makeTestScreen } from "./screen/index.js";

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
      process.cwd(),
    );

    expect(location).toBe("https://registry.example.test/");
  });

  it("normalizes filesystem paths to file URLs", () => {
    const registryPath = path.join(process.cwd(), "tmp", "registry");
    const location = resolveBuiltInRegistryLocation(
      { AXM_REGISTRY_LOCATION: registryPath },
      "https://registry.agentxm.ai",
      process.cwd(),
    );

    expect(location).toBe(pathToFileURL(registryPath).href);
  });

  it("falls back to AXM_REGISTRY_URL when AXM_REGISTRY_LOCATION is unset", () => {
    const location = resolveBuiltInRegistryLocation(
      {},
      "https://registry.example.test",
      process.cwd(),
    );

    expect(location).toBe("https://registry.example.test/");
  });

  it("treats an empty AXM_REGISTRY_LOCATION as unset", () => {
    const location = resolveBuiltInRegistryLocation(
      { AXM_REGISTRY_LOCATION: "" },
      "https://registry.example.test",
      process.cwd(),
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
  it.effect("routes debug diagnostics through Screen", () =>
    Effect.gen(function* () {
      const screen = makeTestScreen();

      yield* Effect.logDebug("machine-safe debug message").pipe(
        Effect.provide(Layer.provide(makeCliLoggerLayer("debug"), screen.layer)),
      );

      expect(screen.state.logs).toEqual([
        { level: "debug", message: "machine-safe debug message" },
      ]);
    }),
  );

  it.effect("emits warnings but suppresses debug diagnostics at normal verbosity", () =>
    Effect.gen(function* () {
      const screen = makeTestScreen();

      yield* Effect.gen(function* () {
        yield* Effect.logDebug("hidden debug message");
        yield* Effect.logWarning("visible warning message");
      }).pipe(Effect.provide(Layer.provide(makeCliLoggerLayer("normal"), screen.layer)));

      expect(screen.state.logs).toEqual([{ level: "warn", message: "visible warning message" }]);
    }),
  );
});

describe("withWorkspace settings gate", () => {
  /**
   * Internal evidence for the executable specification
   * `cli/invalid-workspace-state-gates-operations`, including its
   * workspace-construction-gate claims.
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
    fs.writeFileSync(path.join(projectDir, "axm-lock.yaml"), "lockfileVersion: 7\nskills: {}\n");
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

        // The settings gate now fails with the typed parse error; the CLI
        // boundary converts it to the same `validation` envelope on exit.
        expect(error).toMatchObject({ _tag: "SettingsParseError" });
        expect(commandEvaluated).toBe(false);
      }),
    );
  }
});
