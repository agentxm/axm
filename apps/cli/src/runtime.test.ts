import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { afterEach, beforeEach, vi } from "vitest";
import {
  getBuiltInSources,
  makeCliLoggerLayer,
  withAxmFetchPolicy,
  withAxmUserAgent,
  withWorkspace,
} from "./runtime.js";
import { makeWorkspaceHandlerTestContext } from "./test-support/test-helpers.js";
import { makeTestScreen } from "./test-support/screen-test.js";

describe("getBuiltInSources", () => {
  it("defines only the built-in registry because Git locators are self-describing", () => {
    expect(getBuiltInSources()).toEqual([
      {
        name: "agentxm",
        type: "registry",
        location: new URL("https://registry.agentxm.ai"),
      },
    ]);
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

describe("withAxmFetchPolicy", () => {
  it("observes GitHub's latest-release redirect without changing other requests", async () => {
    const fetchImplementation = Object.assign(
      vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
      { preconnect: vi.fn() },
    );
    const fetchWithPolicy = withAxmFetchPolicy(fetchImplementation);

    await fetchWithPolicy("https://github.com/agentxm/axm/releases/latest", { cache: "no-store" });
    await fetchWithPolicy("https://registry.agentxm.ai/v1/extensions", { cache: "reload" });

    expect(fetchImplementation).toHaveBeenNthCalledWith(1, expect.anything(), {
      cache: "no-store",
      redirect: "manual",
    });
    expect(fetchImplementation).toHaveBeenNthCalledWith(2, expect.anything(), {
      cache: "reload",
    });
  });
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
    fs.writeFileSync(path.join(projectDir, "axm-lock.yaml"), "lockfileVersion: 8\nskills: {}\n");
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

        // The settings gate fails with the typed parse error, which the
        // workspace boundary reports as its envelope for the workspace's scope.
        expect(error).toMatchObject({ _tag: "AppError", code: "validation" });
        expect(error).toMatchObject({ detail: expect.stringContaining("not valid JSON") });
        expect(commandEvaluated).toBe(false);
      }),
    );
  }
});
