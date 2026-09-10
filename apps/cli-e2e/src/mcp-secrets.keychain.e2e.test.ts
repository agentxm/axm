import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Entry } from "@napi-rs/keyring";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createTempDir, runCommand } from "@agentxm/client-e2e-utils";

export const executionBinding = {
  requirements: ["cli/mcps/secret-namespaces-include-local-and-source-identity"],
  boundary: "platform",
  rationale:
    "Runs the built CLI's real MCP install, stored-input reload and secret replacement in its declared Node runtime against the host OS keychain, preserving host HOME for native access while isolating AXM_USER_HOME and project state. A subprocess uses the shipped CLI harness artifact only to derive disposable cleanup identities, without a product source dependency in the test project. Producer and observer use the same runtime application identity across separate processes. Workspace/local/source/input namespaces are isolated and read back natively; a finally block deletes exactly the known disposable entries, requires affirmative deletion for every attempted write, and retains an independent cleanup journal on failure. This establishes only the recorded host and access context, not cross-application access, unavailable-keychain policy or every supported operating system.",
} as const;

const SERVICE = "axm-mcp";
const OWNER = "@acme";
const cliPath = fileURLToPath(new URL("../../cli/dist/src/main.js", import.meta.url));
const identityFixturePath = fileURLToPath(
  new URL("./fixtures/mcp-secret-identities.mjs", import.meta.url),
);

const deriveDisposableAccounts = async (
  requests: ReadonlyArray<{
    scopeRoot: string;
    localName: string;
    inputName: string;
    authority: string;
    owner: string;
    name: string;
  }>,
) => {
  const result = await runCommand(
    process.execPath,
    [identityFixturePath, JSON.stringify(requests)],
    {},
  );
  if (result.exitCode !== 0)
    throw new Error("Built artifact could not derive disposable identities");
  const decoded: unknown = JSON.parse(result.stdout);
  if (!Array.isArray(decoded) || decoded.length !== requests.length)
    throw new Error("Built artifact returned an invalid disposable identity set");
  const accounts: string[] = [];
  for (const value of decoded) {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
      throw new Error("Built artifact returned an invalid disposable identity");
    accounts.push(value);
  }
  return accounts;
};

const writeRegistryMcp = (registryRoot: string, name: string, inputs: ReadonlyArray<string>) => {
  const directory = path.join(registryRoot, "extensions", OWNER, "mcps", name);
  const version = "1.0.0";
  const manifest = {
    owner: OWNER,
    type: "mcp-server",
    name,
    version,
    server: {
      name: `ai.agentxm.native-spec/${name}`,
      description: "Disposable native keychain evidence",
      version,
      packages: [
        {
          registryType: "npm",
          identifier: `@acme/${name}`,
          version,
          transport: { type: "stdio" },
          environmentVariables: inputs.map((input) => ({
            name: input,
            isRequired: true,
            isSecret: true,
          })),
        },
      ],
    },
  };
  const archive = zipSync({ "mcp.json": strToU8(JSON.stringify(manifest)) });
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${version}.zip`), archive);
  fs.writeFileSync(
    path.join(directory, "index.json"),
    JSON.stringify({
      owner: OWNER,
      type: "mcp-server",
      name,
      publisherBindingId: "hbnd_native_spec",
      deprecation: null,
      versions: [
        {
          version,
          published: "2020-01-01T00:00:00.000Z",
          integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
        },
      ],
    }),
  );
};

const writeWorkspace = (root: string, registryUrl: string) => {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "axm.json"),
    JSON.stringify({
      owner: OWNER,
      agents: ["claude-code"],
      minimumReleaseAge: "0s",
      sources: [{ name: "agentxm", type: "registry", location: registryUrl }],
    }),
  );
};

// Native adapter errors never print entry identifiers or values in a test failure.
const native = <A>(operation: () => A): A => {
  try {
    return operation();
  } catch {
    throw new Error("Native keychain operation failed; platform evidence was not established");
  }
};

const invoke = async (root: string, userHome: string, args: ReadonlyArray<string>) => {
  try {
    return await runCommand(process.execPath, [cliPath, ...args], {
      cwd: root,
      env: { AXM_USER_HOME: userHome },
    });
  } catch {
    throw new Error("MCP evidence process failed before producing a result");
  }
};

describe("Native MCP credential persistence", () => {
  it("persists, reloads and replaces isolated credentials without exposing their values", async () => {
    const fixture = createTempDir("axm-native-keychain-spec-");
    const root = fs.realpathSync(fixture.path);
    const registryRoot = path.join(root, "registry");
    const registryUrl = pathToFileURL(registryRoot).href;
    const firstWorkspace = path.join(root, "first");
    const secondWorkspace = path.join(root, "second");
    const userHome = path.join(root, "user-home");
    const suffix = randomUUID().replaceAll("-", "").toUpperCase();
    const inputs = [`AXM_NATIVE_SPEC_A_${suffix}`, `AXM_NATIVE_SPEC_B_${suffix}`];
    const namespaces = [
      { root: firstWorkspace, local: "context", source: "context", reset: false },
      { root: firstWorkspace, local: "personal", source: "context", reset: false },
      { root: secondWorkspace, local: "context", source: "context", reset: false },
      { root: firstWorkspace, local: "context", source: "other", reset: true },
    ];
    const accounts = await deriveDisposableAccounts(
      namespaces.flatMap((row) =>
        inputs.map((input) => ({
          scopeRoot: row.root,
          localName: row.local,
          inputName: input,
          authority: registryUrl,
          owner: OWNER,
          name: row.source,
        })),
      ),
    );
    const rows = namespaces.map((row, rowIndex) => ({
      ...row,
      credentials: inputs.map((input, inputIndex) => {
        const account = accounts[rowIndex * inputs.length + inputIndex];
        if (account === undefined) throw new Error("Disposable identity is missing");
        return {
          input,
          account,
          initial: `SYNTHETIC_INITIAL_${randomUUID()}`,
          replacement: `SYNTHETIC_REPLACEMENT_${randomUUID()}`,
        };
      }),
    }));
    const credentials = rows.flatMap((row) => row.credentials);
    const allValues = credentials.flatMap((credential) => [
      credential.initial,
      credential.replacement,
    ]);
    const cleanupAccounts = new Set<string>();
    const attemptedAccounts = new Set<string>();
    const deletedAccounts = new Set<string>();
    // Keep recovery identities outside the disposable workspace. A denied
    // keychain read can return null, so null alone never establishes cleanup.
    const cleanupJournal = createTempDir("axm-native-keychain-cleanup-");
    const cleanupJournalPath = path.join(cleanupJournal.path, "native-keychain-cleanup.json");
    let stage = "preflight";
    let evidenceEstablished = false;
    const writeCleanupJournal = () =>
      fs.writeFileSync(
        cleanupJournalPath,
        JSON.stringify({
          service: SERVICE,
          accounts: credentials.map((credential) => credential.account),
          attemptedAccounts: [...attemptedAccounts],
          deletedAccounts: [...deletedAccounts],
          stage,
          evidenceEstablished,
        }),
        { mode: 0o600 },
      );
    writeCleanupJournal();
    const saved = new Map<string, string>();
    const outputs: string[] = [];
    const failures: unknown[] = [];
    try {
      writeRegistryMcp(registryRoot, "context", inputs);
      writeRegistryMcp(registryRoot, "other", inputs);
      writeWorkspace(firstWorkspace, registryUrl);
      writeWorkspace(secondWorkspace, registryUrl);
      fs.mkdirSync(userHome, { recursive: true });
      expect(new Set(credentials.map((credential) => credential.account)).size).toBe(8);
      for (const credential of credentials) {
        expect(native(() => new Entry(SERVICE, credential.account).getPassword()) === null).toBe(
          true,
        );
      }
      // The unique roots/input names make these new accounts ours. Register
      // all of them before any CLI process can perform even a partial write.
      for (const credential of credentials) cleanupAccounts.add(credential.account);
      for (const [rowIndex, row] of rows.entries()) {
        if (row.reset) {
          // Model a fresh workspace at the same path while preserving previous
          // OS entries, isolating source identity from the other dimensions.
          fs.rmSync(row.root, { recursive: true, force: true });
          writeWorkspace(row.root, registryUrl);
        }
        const baseArgs = [
          "mcps",
          "install",
          `${OWNER}/mcps/${row.source}`,
          "--as",
          row.local,
          "--reinstall",
          "--non-interactive",
          "--json",
        ];
        for (const phase of ["initial", "replacement", "reload"] as const) {
          const inputArgs =
            phase === "reload"
              ? []
              : row.credentials.flatMap((credential) => [
                  "--env",
                  `${credential.input}=${credential[phase]}`,
                ]);
          for (const credential of row.credentials) attemptedAccounts.add(credential.account);
          stage = `install-${rowIndex}-${phase}`;
          writeCleanupJournal();
          const result = await invoke(row.root, userHome, [...baseArgs, ...inputArgs]);
          stage = `readback-${rowIndex}-${phase}`;
          writeCleanupJournal();
          outputs.push(result.stdout, result.stderr);
          expect(result.exitCode).toBe(0);
          expect(
            (result.stdout + result.stderr).includes("could not be saved to the system keychain"),
          ).toBe(false);
          const settings = fs.readFileSync(path.join(row.root, "axm.json"), "utf8");
          const config = fs.readFileSync(path.join(row.root, ".mcp.json"), "utf8");
          for (const credential of row.credentials) {
            const expected = phase === "initial" ? credential.initial : credential.replacement;
            expect(
              native(() => new Entry(SERVICE, credential.account).getPassword()) === expected,
            ).toBe(true);
            expect(config.includes(`\${${credential.input}}`)).toBe(true);
            saved.set(credential.account, expected);
          }
          // Later writes must not alter credentials in any earlier namespace.
          for (const [account, value] of saved) {
            expect(native(() => new Entry(SERVICE, account).getPassword()) === value).toBe(true);
          }
          expect(
            allValues.every((value) => !settings.includes(value) && !config.includes(value)),
          ).toBe(true);
          expect(
            allValues.every((value) => outputs.every((output) => !output.includes(value))),
          ).toBe(true);
        }
      }
      expect(saved.size).toBe(8);
      evidenceEstablished = true;
    } catch (error) {
      failures.push(error);
    } finally {
      try {
        stage = "cleanup";
        writeCleanupJournal();
        const cleanup = [...cleanupAccounts].map((account) => {
          try {
            const entry = new Entry(SERVICE, account);
            const deleted = entry.deletePassword();
            if (deleted) deletedAccounts.add(account);
            writeCleanupJournal();
            return (
              (!attemptedAccounts.has(account) || deleted) &&
              new Entry(SERVICE, account).getPassword() === null
            );
          } catch {
            return false;
          }
        });
        const cleanupConfirmed = cleanup.every((absent) => absent);
        stage = cleanupConfirmed ? "cleanup-confirmed" : "cleanup-incomplete";
        writeCleanupJournal();
        if (cleanupConfirmed && evidenceEstablished) {
          fixture.cleanup();
          cleanupJournal.cleanup();
        } else if (!cleanupConfirmed)
          failures.push(
            new Error("Native keychain cleanup incomplete; exact disposable identities retained"),
          );
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0)
      throw new AggregateError(
        failures,
        `Native keychain evidence or cleanup failed; disposable identities retained at ${cleanupJournalPath}`,
      );
  });
});
