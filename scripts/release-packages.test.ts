import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { RELEASE_PACKAGES } from "./release-shared.js";
import { capture, captureIn } from "./release-command.js";
import {
  RELEASE_COHORT_MANIFEST,
  validatePack,
  validateReleaseCohort,
  validateReleaseCohortManifest,
} from "./release-packages.js";

const commit = "a".repeat(40);
const version = "1.2.3";
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const manifest = () => ({
  schemaVersion: 1,
  commit,
  version,
  packages: RELEASE_PACKAGES.map((pkg) => ({
    name: pkg.name,
    filename: `${pkg.tarballPrefix}${version}.tgz`,
    integrity: "sha512-candidate",
  })),
});

describe("release cohort artifact manifest", () => {
  it("accepts the complete fixed cohort for the exact commit and version", () => {
    expect(validateReleaseCohortManifest(manifest(), version, commit).packages).toHaveLength(
      RELEASE_PACKAGES.length,
    );
  });

  it("rejects wrong commit, wrong version, and incomplete metadata", () => {
    expect(() => validateReleaseCohortManifest(manifest(), version, "b".repeat(40))).toThrow(
      "commit",
    );
    expect(() => validateReleaseCohortManifest(manifest(), "1.2.4", commit)).toThrow("version");
    const incomplete = manifest();
    incomplete.packages.pop();
    expect(() => validateReleaseCohortManifest(incomplete, version, commit)).toThrow("incomplete");
  });

  it("rejects a renamed or duplicated cohort member", () => {
    const renamed = manifest();
    const first = renamed.packages[0];
    if (first === undefined) throw new Error("Expected release cohort package fixture.");
    first.filename = "wrong.tgz";
    expect(() => validateReleaseCohortManifest(renamed, version, commit)).toThrow(first.name);
  });

  it("rejects a tarball whose bytes do not match the recorded integrity", async () => {
    const directory = mkdtempSync(join(tmpdir(), "axm-release-cohort-test-"));
    temporaryDirectories.push(directory);
    const candidate = manifest();
    writeFileSync(join(directory, RELEASE_COHORT_MANIFEST), JSON.stringify(candidate));
    const first = candidate.packages[0];
    if (first === undefined) throw new Error("Expected release cohort package fixture.");
    writeFileSync(join(directory, first.filename), "different bytes");

    await expect(validateReleaseCohort(directory, version, commit)).rejects.toThrow(
      `Release cohort integrity mismatch: ${first.name}@${version}`,
    );
  });
});

const packedFixture = (fields: Record<string, unknown> = {}) => {
  const directory = mkdtempSync(join(tmpdir(), "axm-package-contract-"));
  temporaryDirectories.push(directory);
  const packageRoot = join(directory, "package");
  const files = {
    "package.json": JSON.stringify({
      name: "@fixture/package-contract",
      version,
      type: "module",
      exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } },
      ...fields,
    }),
    "dist/index.js": "export const value = 1;\n",
    "dist/index.d.ts": "export declare const value: number;\n",
    "dist/cli.js": "#!/usr/bin/env node\nconsole.log('fixture');\n",
  };
  for (const [path, content] of Object.entries(files)) {
    const destination = join(packageRoot, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  }
  const tarball = join(directory, "fixture.tgz");
  execFileSync("tar", ["-czf", tarball, "-C", directory, "package"], {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  return tarball;
};

describe("packed package contracts", () => {
  it("accepts an executable and ESM declarations from the exact tarball", async () => {
    await expect(
      validatePack(
        packedFixture({ bin: { fixture: "./dist/cli.js" } }),
        "@fixture/package-contract",
        version,
      ),
    ).resolves.toBeUndefined();
  });

  it.each([
    { exports: { ".": { types: "./dist/missing.d.ts", default: "./dist/index.js" } } },
    { exports: { ".": { default: "./dist/index.js", types: "./dist/index.d.ts" } } },
    { bin: { fixture: "./dist/missing.js" } },
    { bin: { fixture: "./dist/index.js" } },
  ])("rejects a broken published entry or executable: %j", async (fields) => {
    await expect(
      validatePack(packedFixture(fields), "@fixture/package-contract", version),
    ).rejects.toThrow("Invalid packed package @fixture/package-contract@1.2.3");
  });

  it("still requires the CLI to publish a compiled bin", async () => {
    await expect(
      validatePack(
        packedFixture({ name: "axm.sh", bin: { axm: "./src/main.ts" } }),
        "axm.sh",
        version,
      ),
    ).rejects.toThrow("Packed CLI must expose its compiled bin");
  });

  it.each(["workspace:^", "file:../local", "link:../local"])(
    "still rejects nonportable dependency references: %s",
    async (reference) => {
      await expect(
        validatePack(
          packedFixture({ dependencies: { local: reference } }),
          "@fixture/package-contract",
          version,
        ),
      ).rejects.toThrow("Nonportable packed dependency: local");
    },
  );

  it("preserves published condition precedence and excludes workspace source conditions", async () => {
    const directory = dirname(
      packedFixture({
        exports: {
          ".": {
            types: "./dist/index.d.ts",
            "axm-source": "./src/index.ts",
            node: { types: "./dist/index.d.ts", default: "./dist/index.js" },
            default: "./dist/index.js",
          },
        },
        imports: {
          "#local": {
            "axm-source": "./src/index.ts",
            node: "./dist/index.js",
            default: "./dist/index.js",
          },
        },
        files: ["dist"],
      }),
    );
    const packageRoot = join(directory, "package");
    const original = readFileSync(join(packageRoot, "package.json"), "utf8");
    copyFileSync(
      fileURLToPath(new URL("../.pnpmfile.cjs", import.meta.url)),
      join(packageRoot, ".pnpmfile.cjs"),
    );
    captureIn(packageRoot, "pnpm", ["pack", "--pack-destination", directory]);
    const tarball = join(directory, `fixture-package-contract-${version}.tgz`);

    await expect(
      validatePack(tarball, "@fixture/package-contract", version),
    ).resolves.toBeUndefined();
    const published: unknown = JSON.parse(
      capture("tar", ["-xOf", tarball, "package/package.json"]),
    );
    expect(published).toHaveProperty(["exports", ".", "node", "types"], "./dist/index.d.ts");
    expect(published).not.toHaveProperty(["exports", ".", "axm-source"]);
    expect(published).not.toHaveProperty(["imports", "#local", "axm-source"]);
    expect(readFileSync(join(packageRoot, "package.json"), "utf8")).toBe(original);
  });
});

/**
 * Supersedes the retired specification identity
 * `system/process/dependency-installation-defers-cli-bin`
 * (see `specifications/disposition-ledger.json`): workspace installation must
 * not advertise the unbuilt executable for bin linking, and the published
 * package must expose `axm` at its compiled entry point.
 */
describe("CLI package bin ownership", () => {
  it("defers the compiled executable mapping to publication", () => {
    const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
    const manifestJson: unknown = JSON.parse(
      readFileSync(join(repoRoot, "apps/cli/package.json"), "utf8"),
    );
    expect(manifestJson).not.toHaveProperty("bin");
    expect(manifestJson).toHaveProperty("publishConfig.bin.axm", "./dist/src/main.js");
    expect(manifestJson).toHaveProperty("files", expect.arrayContaining(["dist/src/"]));
  });
});
