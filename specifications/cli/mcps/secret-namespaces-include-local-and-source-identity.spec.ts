import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import * as fs from "node:fs";

import { handleInstallMcpServer, writeWorkspaceFiles } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import { makeSpecRegistry } from "../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/secret-namespaces-include-local-and-source-identity",
  title: "MCP secrets stay in a per-connection keychain namespace and out of workspace files",
  statement:
    "When a locally named MCP connection is installed with a secret input, AXM shall keep the secret in the system keychain under a namespace unique to the workspace, the local connection name, the source, and the input name, and shall write the secret value into neither axm.json, any agent's native configuration, nor the reported result.",
  class: "quality",
  characteristic: "security",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The native keyring Entry boundary is controlled; actual operating-system keychain availability and access policy are not exercised.",
      retirementCondition:
        "Run the same credential lifecycle against disposable keychain entries on each supported operating system.",
    },
  ],
});

// Replace only the native storage boundary. The real loader, account derivation,
// persistence, retrieval and command orchestration run unchanged.
const keychain = vi.hoisted(() => ({
  values: new Map<string, string>(),
  failWrites: false,
  reads: new Array<{ key: string; value: string | null }>(),
  writes: new Array<{ key: string; value: string }>(),
}));
vi.mock("@napi-rs/keyring", () => ({
  Entry: class {
    readonly key: string;
    constructor(service: string, account: string) {
      this.key = `${service}:${account}`;
    }
    getPassword() {
      const value = keychain.values.get(this.key) ?? null;
      keychain.reads.push({ key: this.key, value });
      return value;
    }
    setPassword(value: string) {
      if (keychain.failWrites) throw new Error("synthetic unavailable keychain");
      keychain.values.set(this.key, value);
      keychain.writes.push({ key: this.key, value });
    }
    deletePassword() {
      return keychain.values.delete(this.key);
    }
  },
}));

describe("MCP secrets for locally named connections", () => {
  const cleanups: Array<() => void> = [];
  beforeEach(() => {
    keychain.failWrites = false;
    keychain.values.clear();
    keychain.reads.length = 0;
    keychain.writes.length = 0;
  });
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "an unavailable keychain is reported without writing the secret to files or output",
    () =>
      Effect.gen(function* () {
        const registry = makeSpecRegistry();
        registry.writeMcp("context", [{ version: "1.0.0", secretInput: "API_TOKEN" }]);
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          settings: { sources: [registry.source] },
        });
        cleanups.push(workspace.cleanup, registry.cleanup);
        keychain.failWrites = true;
        const secret = "SYNTHETIC_UNSAVED_SECRET";
        yield* handleInstallMcpServer(
          {
            source: Option.some("@acme/mcps/context"),
            localName: Option.some("context"),
            env: [`API_TOKEN=${secret}`],
          },
          { force: false, preview: false },
        ).pipe(Effect.provide(workspace.layer));
        expect(keychain.values.size).toBe(0);
        const result = JSON.stringify(workspace.rendererState.results.map((entry) => entry.data));
        expect(result).toContain("API_TOKEN could not be saved to the system keychain");
        expect(result).not.toContain(secret);
        expect(workspace.readFile("axm.json")).not.toContain(secret);
        expect(workspace.readFile(".mcp.json")).not.toContain(secret);
      }),
  );

  it.effect(
    "persists and retrieves isolated credentials across workspace, local name, source and input",
    () =>
      Effect.gen(function* () {
        const registry = makeSpecRegistry();
        registry.writeMcp("context", [{ version: "1.0.0", secretInput: "API_TOKEN" }]);
        registry.writeMcp("other", [{ version: "1.0.0", secretInput: "API_TOKEN" }]);
        const first = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          settings: { sources: [registry.source] },
        });
        const second = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          settings: { sources: [registry.source] },
        });
        cleanups.push(first.cleanup, second.cleanup, registry.cleanup);
        const cases = [
          {
            workspace: first,
            localName: "context",
            source: "context",
            input: "API_TOKEN",
            secret: "SYNTHETIC_BASE_SECRET",
          },
          {
            workspace: first,
            localName: "personal",
            source: "context",
            input: "API_TOKEN",
            secret: "SYNTHETIC_LOCAL_SECRET",
          },
          {
            workspace: second,
            localName: "context",
            source: "context",
            input: "API_TOKEN",
            secret: "SYNTHETIC_WORKSPACE_SECRET",
          },
          {
            workspace: first,
            localName: "context",
            source: "other",
            input: "API_TOKEN",
            secret: "SYNTHETIC_SOURCE_SECRET",
          },
          {
            workspace: first,
            localName: "context",
            source: "context",
            input: "OTHER_TOKEN",
            secret: "SYNTHETIC_INPUT_SECRET",
          },
        ];
        for (const [index, scenario] of cases.entries()) {
          // Recreate workspace authority when reusing its local name for a new
          // source/input, while retaining the previous keychain entries.
          if (index >= 3) {
            fs.rmSync(first.root, { recursive: true, force: true });
            fs.mkdirSync(first.root, { recursive: true });
            writeWorkspaceFiles(first.root, { sources: [registry.source] });
          }
          if (scenario.input === "OTHER_TOKEN") {
            registry.writeMcp("context", [{ version: "1.0.0", secretInput: scenario.input }]);
          }
          const install = (env: ReadonlyArray<string>) =>
            handleInstallMcpServer(
              {
                source: Option.some(`@acme/mcps/${scenario.source}`),
                localName: Option.some(scenario.localName),
                env,
              },
              { force: false, preview: false },
            ).pipe(Effect.provide(scenario.workspace.layer));
          yield* install([`${scenario.input}=${scenario.secret}`]);
          const saved = keychain.writes.find((write) => write.value === scenario.secret);
          expect(saved).toBeDefined();
          if (saved === undefined) throw new Error("The credential was not persisted");
          expect(saved.key).toMatch(/^axm-mcp:[0-9a-f]{64}$/);
          expect(keychain.values.get(saved.key)).toBe(scenario.secret);
          // The required input is omitted. Successful reinstall therefore
          // requires retrieval through the exact namespace saved above.
          keychain.reads.length = 0;
          yield* install([]);
          expect(keychain.reads).toContainEqual({ key: saved.key, value: scenario.secret });
          const settings = scenario.workspace.readFile("axm.json");
          const native = scenario.workspace.readFile(".mcp.json");
          const result = JSON.stringify(
            scenario.workspace.rendererState.results.map((entry) => entry.data),
          );
          expect(native).toContain(`\${${scenario.input}}`);
          expect(result).not.toContain("could not be saved to the system keychain");
          for (const { secret } of cases) {
            expect(settings).not.toContain(secret);
            expect(native).not.toContain(secret);
            expect(result).not.toContain(secret);
          }
        }
        expect(keychain.values.size).toBe(cases.length);
        expect([...keychain.values.values()].sort()).toEqual(
          cases.map(({ secret }) => secret).sort(),
        );
      }),
  );
});
