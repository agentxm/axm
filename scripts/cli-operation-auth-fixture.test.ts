import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import { expect, it } from "@effect/vitest";
import { authScenarios } from "../benchmarks/cli-operations/auth-scenarios.js";
import type { ProcessResult, ScenarioContext } from "../benchmarks/cli-operations/fixtures.js";

class FixtureTestFailed extends Data.TaggedError("FixtureTestFailed")<{
  readonly cause: unknown;
}> {}
const observe = <A>(action: () => Promise<A>) =>
  Effect.tryPromise({ try: action, catch: (cause) => new FixtureTestFailed({ cause }) });

const result = (body: unknown): ProcessResult => ({
  exitCode: 0,
  durationMs: 0,
  stdout: JSON.stringify(body),
  stderr: "",
  cpuUserMs: null,
  cpuSystemMs: null,
  peakRssBytes: null,
  ioReadBytes: null,
  ioWriteBytes: null,
});

const registryUrl = async (context: ScenarioContext) => {
  const settings = Schema.decodeUnknownSync(
    Schema.fromJsonString(
      Schema.Struct({
        sources: Schema.Array(Schema.Struct({ location: Schema.String })),
      }),
    ),
  )(await fs.readFile(path.join(context.home, ".axm", "workspace", "axm.json"), "utf8"));
  const url = settings.sources[0]?.location;
  if (url === undefined) throw new Error("Fixture Registry was not configured");
  return url;
};

const document = (url: string, status: string, flow?: string) =>
  result({
    ok: true,
    result: {
      status,
      registryHost: new URL(url).host,
      handle: "@alice",
      userCode: "ABCD-1234",
      ...(flow === undefined ? {} : { flow }),
    },
  });

const credentials = (context: ScenarioContext) =>
  path.join(context.home, ".config", "axm", "credentials.json");
const pending = (context: ScenarioContext) => path.join(context.home, ".axm", "pending-login.json");
const writePrivateJson = async (file: string, value: unknown) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value), { mode: 0o600 });
};
const writeSession = (context: ScenarioContext, url: string) =>
  writePrivateJson(credentials(context), {
    version: 1,
    registries: {
      [url]: {
        accounts: {
          "@alice": {
            access_token: "axm_ses_e2e",
            refresh_token: "axm_ref_e2e",
            expires_at: "2099-01-01T00:00:00.000Z",
            active: true,
          },
        },
      },
    },
  });
const writePending = (context: ScenarioContext, url: string) =>
  writePrivateJson(pending(context), {
    version: 3,
    registryUrl: url,
    deviceCode: "device-secret",
    userCode: "ABCD-1234",
    verificationUri: `${url}/device`,
    verificationUriComplete: `${url}/device?user_code=ABCD-1234`,
    interval: 1,
    expiresAt: "2099-01-01T00:00:00.000Z",
  });

type Preparation = (context: ScenarioContext) => Promise<ProcessResult>;
// The declared process boundary is simulated here to test rejection of false success.
// These tests never launch AXM, load native credentials, or call a host keychain.
const contextFor = (prepare: Preparation) =>
  Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(
      observe(() => fs.mkdtemp(path.join(os.tmpdir(), "axm-auth-fixture-test-"))),
      (root) => observe(() => fs.rm(root, { recursive: true, force: true })).pipe(Effect.orDie),
    );
    const home = path.join(root, "home");
    const workspace = path.join(root, "workspace");
    yield* observe(() => Promise.all([fs.mkdir(home), fs.mkdir(workspace)]));
    const context: ScenarioContext = {
      subject: "candidate",
      root,
      home,
      workspace,
      repoRoot: root,
      binary: "never-executed",
      run: async (args, options) => {
        expect(options?.env).toEqual({ CI: "", SSH_CLIENT: "benchmark" });
        if (args[0] === "token") return { ...result(null), stdout: "axm_ses_e2e\n" };
        return prepare(context);
      },
    };
    return context;
  });
const scenario = (id: string) => {
  const selected = authScenarios().find((entry) => entry.id === id);
  if (selected === undefined) throw new Error(`Missing auth scenario ${id}`);
  return selected;
};
const prepared = (id: string, context: ScenarioContext) =>
  Effect.acquireRelease(
    observe(() => scenario(id).prepare(context)),
    (invocation) =>
      observe(async () => {
        await invocation.dispose?.();
      }).pipe(Effect.orDie),
  );
const approved: Preparation = async (context) => {
  const url = await registryUrl(context);
  await writeSession(context, url);
  return document(url, "logged-in");
};

it.effect(
  "auth preparation rejects an inherited session and retains its successful JSON for diagnosis",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* contextFor(async (context) =>
          document(await registryUrl(context), "already-logged-in"),
        );
        yield* observe(() =>
          expect(scenario("auth:login:pending-reuse:json").prepare(context)).rejects.toThrow(
            '"status":"already-logged-in"',
          ),
        );
      }),
    ),
);

for (const state of ["pending", "session"]) {
  it.effect(
    `auth preparation requires the local ${state} artifact after successful login output`,
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* contextFor(async (context) =>
            document(
              await registryUrl(context),
              state === "pending" ? "pending-human" : "logged-in",
              state === "pending" ? "started" : undefined,
            ),
          );
          const id = state === "pending" ? "auth:login:pending-reuse:json" : "auth:whoami:json";
          yield* observe(() =>
            expect(scenario(id).prepare(context)).rejects.toThrow(
              "Required local auth file is missing",
            ),
          );
        }),
      ),
  );
}

it.effect("auth preparation rejects credentials stored for a different Registry", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const context = yield* contextFor(async (context) => {
        await writeSession(context, "http://127.0.0.1:1");
        return document(await registryUrl(context), "logged-in");
      });
      yield* observe(() =>
        expect(scenario("auth:whoami:json").prepare(context)).rejects.toThrow(
          "only the approved fixture session",
        ),
      );
    }),
  ),
);

it.effect(
  "pending reuse requires the original durable authorization and cannot create credentials",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* contextFor(async (context) => {
          const url = await registryUrl(context);
          await writePending(context, url);
          return document(url, "pending-human", "started");
        });
        const invocation = yield* prepared("auth:login:pending-reuse:json", context);
        expect(invocation.env).toEqual({ CI: "", SSH_CLIENT: "benchmark" });
        const url = yield* observe(() => registryUrl(context));
        const reemitted = document(url, "pending-human", "re-emitted");
        yield* observe(async () => {
          await invocation.verify(reemitted);
        });
        yield* observe(() => writeSession(context, url));
        yield* observe(() =>
          expect(invocation.verify(reemitted)).rejects.toThrow("Unexpected auth state"),
        );
      }),
    ),
);

it.effect(
  "retaining a session verifies its identity request and preserves local credential bytes",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* contextFor(approved);
        const invocation = yield* prepared("auth:login:retained-session:json", context);
        const url = yield* observe(() => registryUrl(context));
        const response = yield* HttpClient.get(`${url}/v1/auth/me`);
        expect(response.status).toBe(200);
        yield* response.arrayBuffer;
        const retained = document(url, "already-logged-in");
        yield* observe(async () => {
          await invocation.verify(retained);
        });
        yield* observe(() => fs.appendFile(credentials(context), "\n"));
        yield* observe(() =>
          expect(invocation.verify(retained)).rejects.toThrow("changed its local credential file"),
        );
      }).pipe(Effect.provide(FetchHttpClient.layer)),
    ),
);

it.effect("logout requires completed remote revocation and removes the local session", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const context = yield* contextFor(approved);
      const invocation = yield* prepared("auth:logout:json", context);
      const url = yield* observe(() => registryUrl(context));
      yield* observe(() =>
        expect(invocation.verify(document(url, "logged-out-local-only"))).rejects.toThrow(
          "completed revocation",
        ),
      );
      const loggedOut = document(url, "logged-out");
      yield* observe(() =>
        expect(invocation.verify(loggedOut)).rejects.toThrow(
          "did not observe POST /v1/auth/revoke",
        ),
      );
      const response = yield* HttpClient.post(`${url}/v1/auth/revoke`);
      expect(response.status).toBe(200);
      yield* response.arrayBuffer;
      yield* observe(() =>
        expect(invocation.verify(loggedOut)).rejects.toThrow("Unexpected auth state"),
      );
      yield* observe(() => fs.rm(credentials(context)));
      yield* observe(async () => {
        await invocation.verify(loggedOut);
      });
    }).pipe(Effect.provide(FetchHttpClient.layer)),
  ),
);
