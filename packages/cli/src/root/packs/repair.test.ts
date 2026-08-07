import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import {
  computePackageContentHashSync,
  writeTrustFromWorkspaceLockfile,
  writeWorkspaceFiles,
} from "../../test-stubs.js";
import {
  expectDefined,
  expectRecord,
  getAppError,
  makeWorkspaceHandlerTestContext,
  property,
} from "../../test-helpers.js";
import { handlePacksRepair } from "./repair.js";

const initializeAuthoredPack = (root: string) => {
  const axmDir = path.join(root, ".axm");
  writeWorkspaceFiles(axmDir, {
    owner: "@acme",
    packs: { toolkit: "workspace:@acme/packs/toolkit" },
  });
  const packDir = path.join(axmDir, "extensions", "@acme", "packs", "toolkit");
  fs.mkdirSync(packDir, { recursive: true });
  const manifest = {
    owner: "@acme",
    type: "pack",
    name: "toolkit",
    version: "1.0.0",
    description: "Initial description",
    keywords: ["initial"],
    dependencies: {},
  };
  fs.writeFileSync(path.join(packDir, "pack.json"), JSON.stringify(manifest, null, 2) + "\n");

  const lockPath = path.join(axmDir, "axm-lock.yaml");
  const lockfile = expectRecord(YAML.parse(fs.readFileSync(lockPath, "utf8")));
  const packs = expectRecord(lockfile["packs"] ?? {});
  const updatedPacks = {
    ...packs,
    toolkit: {
      type: "workspace",
      owner: "@acme",
      extensionType: "pack",
      name: "toolkit",
      version: "1.0.0",
      sourceHash: computePackageContentHashSync(packDir),
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      resolvedSkills: {},
      resolvedMcpServers: {},
      resolvedSubagents: {},
      resolvedRules: {},
      resolvedHooks: {},
      resolvedKnowledge: {},
    },
  };
  fs.writeFileSync(lockPath, YAML.stringify({ ...lockfile, packs: updatedPacks }));
  writeTrustFromWorkspaceLockfile(axmDir);

  const trustPath = path.join(axmDir, "trust.json");
  const trust = expectRecord(JSON.parse(fs.readFileSync(trustPath, "utf8")));
  const records = expectRecord(trust["records"]);
  const pack = expectRecord(records["pack:toolkit"]);
  fs.writeFileSync(
    trustPath,
    JSON.stringify(
      {
        ...trust,
        records: {
          ...records,
          "pack:toolkit": {
            ...pack,
            packManifest: {
              owner: "@acme",
              name: "toolkit",
              version: "1.0.0",
              dependencies: {},
              metadataIdentity: '{"description":"Initial description","keywords":["initial"]}',
            },
          },
        },
      },
      null,
      2,
    ),
  );
  return { packDir, trustPath };
};

describe("packs repair", () => {
  let root: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    root = fs.mkdtempSync(path.join(os.tmpdir(), "packs-repair-test-"));
    process.chdir(root);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.effect("previews metadata drift without writing trust", () =>
    Effect.gen(function* () {
      const { packDir, trustPath } = initializeAuthoredPack(root);
      const manifestPath = path.join(packDir, "pack.json");
      const manifest = expectRecord(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
      fs.writeFileSync(
        manifestPath,
        JSON.stringify({ ...manifest, description: "Updated description" }, null, 2) + "\n",
      );
      const trustBefore = fs.readFileSync(trustPath, "utf8");
      const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });

      yield* provide(
        handlePacksRepair({
          target: "toolkit",
          acceptCurrent: false,
          preview: true,
        }),
      );

      expect(fs.readFileSync(trustPath, "utf8")).toBe(trustBefore);
      const result = expectRecord(expectDefined(rendererState.results[0]).data);
      expect(property(result, "pack")).toBe("@acme/packs/toolkit");
      expect(property(result, "result")).toBe("previewed");
      expect(property(result, "confirmation")).toBe("accept-current");
      expect(property(result, "changes")).toEqual([
        { classification: "metadata", fields: ["description/keywords/metadata"] },
      ]);
      expect(property(result, "recoveryAction")).toBe(
        "axm packs repair @acme/packs/toolkit --accept-current",
      );
    }),
  );

  it.effect("accepts current metadata drift offline and refreshes trust", () =>
    Effect.gen(function* () {
      const { packDir, trustPath } = initializeAuthoredPack(root);
      const manifestPath = path.join(packDir, "pack.json");
      const manifest = expectRecord(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
      fs.writeFileSync(
        manifestPath,
        JSON.stringify({ ...manifest, keywords: ["initial", "updated"] }, null, 2) + "\n",
      );
      const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });

      yield* provide(
        handlePacksRepair({
          target: "@acme/packs/toolkit",
          acceptCurrent: true,
          preview: false,
        }),
      );

      const result = expectRecord(expectDefined(rendererState.results[0]).data);
      expect(property(result, "result")).toBe("repaired");
      const trust = expectRecord(JSON.parse(fs.readFileSync(trustPath, "utf8")));
      const record = expectRecord(expectRecord(trust["records"])["pack:toolkit"]);
      expect(record["contentIdentity"]).toBe(computePackageContentHashSync(packDir));
      expect(expectRecord(record["packManifest"])["metadataIdentity"]).toContain("updated");
    }),
  );

  it.effect("refuses a malformed manifest without changing trust", () =>
    Effect.gen(function* () {
      const { packDir, trustPath } = initializeAuthoredPack(root);
      fs.writeFileSync(path.join(packDir, "pack.json"), "{broken");
      const trustBefore = fs.readFileSync(trustPath, "utf8");
      const { provide } = makeWorkspaceHandlerTestContext();

      const error = yield* provide(
        handlePacksRepair({
          target: "toolkit",
          acceptCurrent: true,
          preview: false,
        }),
      ).pipe(Effect.flip);

      expect(getAppError(error).detail).toContain("malformed");
      expect(fs.readFileSync(trustPath, "utf8")).toBe(trustBefore);
    }),
  );
});
