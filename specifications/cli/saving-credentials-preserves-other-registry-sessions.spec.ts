import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";
import { vi } from "vitest";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { KeychainTest } from "@agentxm/registry-auth/testing";
import { CredentialStore, makeCredentialStoreLive } from "axm.sh/specification-harness";

const homes: Array<string> = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
});

export const specification = defineSpecification({
  requirement: "cli/saving-credentials-preserves-other-registry-sessions",
  title: "Saving a session leaves other Registry sessions available",
  statement:
    "When AXM saves credentials for the selected Registry, it shall leave saved sessions for every other Registry available, whichever supported credential storage holds them.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation"],
  methods: ["example"],
  derivedFrom: ["packages/registry-auth/src/credential-store.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const selectedRegistry = "https://registry.example.test";
const otherRegistry = "https://other.example.test";
const handle = normalizeHandle("@alice");
const credentialsFor = (name: string) => ({
  access_token: `fixture-${name}-access`,
  refresh_token: `fixture-${name}-refresh`,
  expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00.000Z"),
});

const makeFixture = () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "axm-credential-home-"));
  homes.push(home);
  vi.stubEnv("AXM_USER_HOME", home);
  const keychain = KeychainTest();
  const platform = Layer.mergeAll(NodeServices.layer, keychain.layer);
  return {
    home,
    keychain,
    // One host, one user, two storage tiers: the restricted file is what a
    // container or remote session writes, the keychain what a local session
    // writes. Both hold real sessions at the same time.
    fileTier: Layer.provide(makeCredentialStoreLive("restricted-file"), platform),
    keychainTier: Layer.provide(makeCredentialStoreLive("keychain"), platform),
  };
};

const save = (registryUrl: string, name: string) =>
  Effect.flatMap(CredentialStore, (store) => store.save(registryUrl, handle, credentialsFor(name)));

const load = (registryUrl: string) =>
  Effect.flatMap(CredentialStore, (store) => store.load(registryUrl));

describe("Saving credentials for the selected Registry", () => {
  it.effect("leaves a session another storage tier holds for a different Registry", () => {
    const fixture = makeFixture();
    return Effect.gen(function* () {
      yield* save(otherRegistry, "other").pipe(Effect.provide(fixture.fileTier));
      const before = yield* load(otherRegistry).pipe(Effect.provide(fixture.fileTier));
      expect(Option.isSome(before)).toBe(true);

      yield* save(selectedRegistry, "selected").pipe(Effect.provide(fixture.keychainTier));

      const after = yield* load(otherRegistry).pipe(Effect.provide(fixture.fileTier));
      expect(after).toEqual(before);
      const selected = yield* load(selectedRegistry).pipe(Effect.provide(fixture.keychainTier));
      expect(Option.map(selected, (found) => found.access_token)).toEqual(
        Option.some("fixture-selected-access"),
      );
    });
  });

  it.effect("retires only the migrated Registry's plaintext copy", () => {
    const fixture = makeFixture();
    const credentialFile = path.join(fixture.home, ".config", "axm", "credentials.json");
    return Effect.gen(function* () {
      yield* save(selectedRegistry, "plaintext").pipe(Effect.provide(fixture.fileTier));
      yield* save(otherRegistry, "other").pipe(Effect.provide(fixture.fileTier));

      yield* save(selectedRegistry, "selected").pipe(Effect.provide(fixture.keychainTier));

      const remaining: unknown = JSON.parse(fs.readFileSync(credentialFile, "utf8"));
      expect(remaining).toMatchObject({ registries: { [otherRegistry]: {} } });
      expect(JSON.stringify(remaining)).not.toContain(selectedRegistry);
      expect(JSON.stringify(remaining)).not.toContain("fixture-plaintext-refresh");
    });
  });

  it.effect("removes the credential file once its last Registry moves to the keychain", () => {
    const fixture = makeFixture();
    const credentialFile = path.join(fixture.home, ".config", "axm", "credentials.json");
    return Effect.gen(function* () {
      yield* save(selectedRegistry, "plaintext").pipe(Effect.provide(fixture.fileTier));
      yield* save(selectedRegistry, "selected").pipe(Effect.provide(fixture.keychainTier));
      expect(fs.existsSync(credentialFile)).toBe(false);
    });
  });
});
