import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import {
  MCP_SECRET_SERVICE,
  McpSecretStore,
  type McpSecretStoreService,
} from "@agentxm/extension-materialization";

import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../../install/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/secret-namespaces-include-local-and-source-identity",
  title: "MCP secrets stay in a per-connection credential namespace and out of workspace files",
  statement:
    "When a locally named MCP connection is installed with a secret input, AXM shall keep the secret in the credential store under a namespace unique to the workspace, the local connection name, the source, and the input name, and shall write the secret value into neither axm.json, any agent's native configuration, nor the reported outcome.",
  class: "quality",
  characteristic: "security",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [
    "packages/core/extension-materialization/src/mcps/secret-store.ts",
    // The real system keychain is exercised as separately selected platform
    // evidence in apps/cli-e2e/src/mcp-secrets.keychain.e2e.test.ts.
    "apps/cli-e2e/src/mcp-secrets.keychain.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "When the credential store cannot persist a required secret, must installation fail, or may it complete with a warning and require the secret to be supplied later? The current statement promises storage; the controlled unavailable-store case establishes disclosure safety, not satisfaction of storage.",
  ],
  limitations: [
    {
      limitation:
        "Default scenarios control the credential-store port. The separately selected platform execution exercises the actual system keychain only on its recorded host and access context; other operating systems and access policies remain unverified.",
      retirementCondition:
        "Run the same credential lifecycle against disposable keychain entries on each supported operating system.",
    },
  ],
});

/**
 * The credential store, recorded.
 *
 * Only the storage boundary is controlled: the account derivation, the
 * persistence and retrieval decisions, and the whole install closure run
 * unchanged. Reads are recorded as well as writes, because "a reinstall
 * retrieves through the exact namespace it saved under" is only observable
 * from the account the read asked for.
 */
const makeRecordingSecretStore = () => {
  const values = new Map<string, string>();
  const reads: Array<{ readonly account: string; readonly value: string | null }> = [];
  const writes: Array<{ readonly account: string; readonly value: string }> = [];
  let failWrites = false;
  const service: McpSecretStoreService = {
    read: (account) =>
      Effect.sync(() => {
        const value = values.get(account) ?? null;
        reads.push({ account, value });
        return Option.fromNullOr(value);
      }),
    write: (account, value) =>
      Effect.sync(() => {
        if (failWrites) return "failed";
        values.set(account, value);
        writes.push({ account, value });
        return "saved";
      }),
    erase: (account) => Effect.sync(() => (values.delete(account) ? "deleted" : "absent")),
  };
  return {
    layer: Layer.succeed(McpSecretStore, service),
    values,
    reads,
    writes,
    refuseWrites: (refuse: boolean) => {
      failWrites = refuse;
    },
  };
};

/** What the workspace holds and what the caller was told, as text. */
const observable = (world: InstallWorld, outcome: unknown) => ({
  settings: world.workspace.readFile("axm.json"),
  native: world.workspace.exists(".mcp.json") ? world.workspace.readFile(".mcp.json") : "",
  reported: JSON.stringify(outcome),
});

/**
 * Return the workspace to a freshly set up state while the credential store
 * keeps everything it already holds, so a later scenario may reuse a local
 * connection name for a different source or input.
 */
const resetWorkspaceAuthority = (world: InstallWorld): void => {
  for (const entry of fs.readdirSync(world.workspace.root))
    fs.rmSync(nodePath.join(world.workspace.root, entry), { recursive: true, force: true });
  fs.mkdirSync(nodePath.join(world.workspace.root, ".axm"), { recursive: true });
  world.workspace.writeFile(
    "axm.json",
    JSON.stringify(
      { owner: "@acme", agents: ["claude-code"], sources: [world.registry.source] },
      null,
      2,
    ),
  );
  world.workspace.writeFile("axm-lock.yaml", JSON.stringify({ lockfileVersion: 7, skills: {} }));
};

describe("MCP secrets for locally named connections", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** The request `axm mcps install <source> --as <name> --env NAME=VALUE` builds. */
  const install = (source: string, localName: string, env: ReadonlyArray<string>) =>
    applyInstall(
      installRequest({
        type: "mcp-server",
        subject: { kind: "source", source: `@acme/mcps/${source}` },
        localName,
        env,
      }),
    );

  it.effect(
    "an unavailable credential store is reported without writing the secret to files or the outcome",
    () => {
      const world = makeInstallWorld();
      cleanups.push(world.cleanup);
      world.registry.writeMcp("context", [{ version: "1.0.0", secretInput: "API_TOKEN" }]);
      const store = makeRecordingSecretStore();
      store.refuseWrites(true);
      const secret = "SYNTHETIC_UNSAVED_SECRET";
      return world.workspace
        .provide(
          Effect.gen(function* () {
            const outcome = yield* install("context", "context", [`API_TOKEN=${secret}`]).pipe(
              Effect.provide(store.layer),
            );

            expect(store.values.size).toBe(0);
            const seen = observable(world, outcome);
            expect(seen.reported).toContain("API_TOKEN could not be saved");
            for (const text of Object.values(seen)) expect(text).not.toContain(secret);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "persists and retrieves isolated credentials across workspace, local name, source and input",
    () => {
      const first = makeInstallWorld();
      const second = makeInstallWorld({ registry: first.registry });
      cleanups.push(first.cleanup, second.cleanup);
      first.registry.writeMcp("context", [{ version: "1.0.0", secretInput: "API_TOKEN" }]);
      first.registry.writeMcp("other", [{ version: "1.0.0", secretInput: "API_TOKEN" }]);
      const store = makeRecordingSecretStore();

      /**
       * One row per fact the namespace must separate on: the workspace, the
       * local connection name, the source, and the input name.
       */
      const cases = [
        {
          world: first,
          localName: "context",
          source: "context",
          input: "API_TOKEN",
          secret: "SYNTHETIC_BASE_SECRET",
        },
        {
          world: first,
          localName: "personal",
          source: "context",
          input: "API_TOKEN",
          secret: "SYNTHETIC_LOCAL_SECRET",
        },
        {
          world: second,
          localName: "context",
          source: "context",
          input: "API_TOKEN",
          secret: "SYNTHETIC_WORKSPACE_SECRET",
        },
        {
          world: first,
          localName: "context",
          source: "other",
          input: "API_TOKEN",
          secret: "SYNTHETIC_SOURCE_SECRET",
        },
        {
          world: first,
          localName: "context",
          source: "context",
          input: "OTHER_TOKEN",
          secret: "SYNTHETIC_INPUT_SECRET",
        },
      ] as const;

      return Effect.gen(function* () {
        for (const [index, scenario] of cases.entries()) {
          // Reuse of a local connection name for a new source or input needs
          // workspace authority back; the credential store keeps its entries.
          if (index >= 3) resetWorkspaceAuthority(first);
          if (scenario.input === "OTHER_TOKEN")
            first.registry.writeMcp("context", [{ version: "1.0.0", secretInput: scenario.input }]);

          const applied = yield* scenario.world.workspace
            .provide(
              install(scenario.source, scenario.localName, [
                `${scenario.input}=${scenario.secret}`,
              ]).pipe(Effect.provide(store.layer)),
            )
            .pipe(Effect.provide(NodeServices.layer));

          const saved = store.writes.find((write) => write.value === scenario.secret);
          expect(saved, `${scenario.localName}/${scenario.source}/${scenario.input}`).toBeDefined();
          if (saved === undefined) throw new Error("The credential was not persisted");
          // The account is an opaque digest: no workspace path, connection
          // name, source or input appears in the credential store in clear.
          expect(saved.account).toMatch(/^[0-9a-f]{64}$/);
          expect(store.values.get(saved.account)).toBe(scenario.secret);

          // The required input is omitted. A successful reinstall therefore
          // requires retrieval through the exact namespace saved above.
          store.reads.length = 0;
          const reinstalled = yield* scenario.world.workspace
            .provide(
              install(scenario.source, scenario.localName, []).pipe(Effect.provide(store.layer)),
            )
            .pipe(Effect.provide(NodeServices.layer));
          expect(store.reads).toContainEqual({
            account: saved.account,
            value: scenario.secret,
          });

          const seen = observable(scenario.world, [applied, reinstalled]);
          expect(seen.native).toContain(`\${${scenario.input}}`);
          expect(seen.reported).not.toContain("could not be saved");
          for (const { secret } of cases)
            for (const [surface, text] of Object.entries(seen))
              expect(text, `${surface} disclosed ${secret}`).not.toContain(secret);
        }

        expect(store.values.size).toBe(cases.length);
        expect([...store.values.values()].sort()).toEqual(cases.map(({ secret }) => secret).sort());
        // Every secret is filed under the one AXM credential-store service.
        expect(MCP_SECRET_SERVICE).toBe("axm-mcp");
      });
    },
  );
});
