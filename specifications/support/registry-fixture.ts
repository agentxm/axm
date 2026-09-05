/**
 * File-based Registry fixture for CLI specifications.
 *
 * Writes the real Registry directory layout — a per-extension index plus
 * version archives with genuine integrity hashes — that the production
 * source-resolution layer reads over `file://`. Publication instants predate
 * the deterministic test clock by more than the default minimum release age,
 * so every written version is immediately eligible for selection. Rewriting an
 * extension with an extended version list models a later publication.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface RegistrySkillVersion {
  readonly version: string;
  /** Body text of the skill document, so versions are observably distinct. */
  readonly body: string;
  /**
   * Publication instant. Defaults to one that predates the minimum release
   * age; pass a recent instant to model a release the age policy still holds.
   */
  readonly published?: string;
}

export interface RegistryMcpVersion {
  readonly version: string;
  /** Additional package files included in the version archive. */
  readonly files?: Readonly<Record<string, string>>;
  /** Optional environment input used by credential-lifecycle specifications. */
  readonly secretInput?: string;
}

export interface RegistryPackVersion {
  readonly version: string;
  /** Additional package files included in the version archive. */
  readonly files?: Readonly<Record<string, string>>;
  /** Member constraints keyed by fully qualified name, as the pack manifest records them. */
  readonly dependencies: Readonly<Record<string, string>>;
  readonly published?: string;
}

export interface RegistryKnowledgeVersion {
  readonly version: string;
  /** Body text of the bundle's root index, so versions are observably distinct. */
  readonly body: string;
  readonly published?: string;
}

export interface SpecRegistry {
  /** Absolute Registry root directory. */
  readonly root: string;
  /** Settings `sources` entry pointing at this Registry. */
  readonly source: {
    readonly name: string;
    readonly type: "registry";
    readonly location: string;
  };
  /**
   * Publishes the complete version list for one skill, replacing any previous
   * index for it. Call again with more versions to model a later publication.
   */
  readonly writeSkill: (name: string, versions: ReadonlyArray<RegistrySkillVersion>) => void;
  readonly writeMcp: (name: string, versions: ReadonlyArray<RegistryMcpVersion>) => void;
  /** Publishes the complete version list for one pack whose members are other Registry extensions. */
  readonly writePack: (name: string, versions: ReadonlyArray<RegistryPackVersion>) => void;
  /** Publishes the complete version list for one Open Knowledge Format bundle. */
  readonly writeKnowledge: (
    name: string,
    versions: ReadonlyArray<RegistryKnowledgeVersion>,
  ) => void;
  readonly cleanup: () => void;
}

const PUBLISHED_AT = "1960-01-01T00:00:00Z";
const OWNER = "@acme";

const versionParts = (version: string): ReadonlyArray<number> =>
  (version.split("-")[0] ?? version).split(".").map((part) => Number.parseInt(part, 10));

/**
 * The Registry index lists versions newest-first and the resolvers rely on
 * that order; callers may pass versions in any order.
 */
const newestFirst = <T extends { readonly version: string }>(
  entries: ReadonlyArray<T>,
): ReadonlyArray<T> =>
  [...entries].sort((left, right) => {
    const a = versionParts(left.version);
    const b = versionParts(right.version);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      const difference = (b[index] ?? 0) - (a[index] ?? 0);
      if (difference !== 0) return difference;
    }
    return 0;
  });

export const makeSpecRegistry = (): SpecRegistry => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-spec-registry-")));

  const writeSkill = (name: string, versions: ReadonlyArray<RegistrySkillVersion>): void => {
    const skillDir = path.join(root, "extensions", OWNER, "skills", name);
    const entries = versions.map(({ version, body, published }) => {
      const stagingDir = path.join(skillDir, `staging-${version}`);
      fs.mkdirSync(path.join(stagingDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(stagingDir, "skill.json"),
        `${JSON.stringify(
          { owner: OWNER, type: "skill", name, version, description: `The ${name} skill.` },
          null,
          2,
        )}\n`,
      );
      fs.writeFileSync(
        path.join(stagingDir, "src", "SKILL.md"),
        `---\nname: "${name}"\ndescription: "The ${name} skill."\n---\n\n# ${name}\n\n${body}\n`,
      );
      const archivePath = path.join(skillDir, `${version}.zip`);
      execFileSync("zip", ["-qr", archivePath, "skill.json", "src"], { cwd: stagingDir });
      fs.rmSync(stagingDir, { recursive: true, force: true });
      const archive = fs.readFileSync(archivePath);
      return {
        version,
        published: published ?? PUBLISHED_AT,
        integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
      };
    });
    fs.writeFileSync(
      path.join(skillDir, "index.json"),
      `${JSON.stringify(
        {
          owner: OWNER,
          type: "skill",
          name,
          publisherBindingId: "hbnd_test",
          deprecation: null,
          versions: newestFirst(entries),
        },
        null,
        2,
      )}\n`,
    );
  };

  const writeMcp = (name: string, versions: ReadonlyArray<RegistryMcpVersion>): void => {
    const mcpDir = path.join(root, "extensions", OWNER, "mcps", name);
    const entries = versions.map(({ version, secretInput, files }) => {
      const stagingDir = path.join(mcpDir, `staging-${version}`);
      fs.mkdirSync(stagingDir, { recursive: true });
      fs.writeFileSync(
        path.join(stagingDir, "mcp.json"),
        `${JSON.stringify(
          {
            owner: OWNER,
            type: "mcp-server",
            name,
            version,
            server: {
              name: `ai.agentxm.spec/${name}`,
              description: `The ${name} MCP server.`,
              version,
              packages: [
                {
                  registryType: "npm",
                  identifier: `@acme/${name}`,
                  version,
                  transport: { type: "stdio" },
                  ...(secretInput === undefined
                    ? {}
                    : {
                        environmentVariables: [
                          { name: secretInput, isRequired: true, isSecret: true },
                        ],
                      }),
                },
              ],
            },
          },
          null,
          2,
        )}\n`,
      );
      const archivePath = path.join(mcpDir, `${version}.zip`);
      for (const [relative, content] of Object.entries(files ?? {})) {
        const target = path.join(stagingDir, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
      }
      execFileSync("zip", ["-qr", archivePath, "mcp.json", ...Object.keys(files ?? {})], {
        cwd: stagingDir,
      });
      fs.rmSync(stagingDir, { recursive: true, force: true });
      const archive = fs.readFileSync(archivePath);
      return {
        version,
        published: PUBLISHED_AT,
        integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
      };
    });
    fs.writeFileSync(
      path.join(mcpDir, "index.json"),
      `${JSON.stringify(
        {
          owner: OWNER,
          type: "mcp-server",
          name,
          publisherBindingId: "hbnd_test",
          deprecation: null,
          versions: newestFirst(entries),
        },
        null,
        2,
      )}\n`,
    );
  };

  const writePack = (name: string, versions: ReadonlyArray<RegistryPackVersion>): void => {
    const packDir = path.join(root, "extensions", OWNER, "packs", name);
    const entries = versions.map(({ version, dependencies, published, files }) => {
      const stagingDir = path.join(packDir, `staging-${version}`);
      fs.mkdirSync(stagingDir, { recursive: true });
      fs.writeFileSync(
        path.join(stagingDir, "pack.json"),
        `${JSON.stringify(
          {
            owner: OWNER,
            type: "pack",
            name,
            version,
            description: `The ${name} pack.`,
            dependencies,
          },
          null,
          2,
        )}\n`,
      );
      const archivePath = path.join(packDir, `${version}.zip`);
      for (const [relative, content] of Object.entries(files ?? {})) {
        const target = path.join(stagingDir, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
      }
      execFileSync("zip", ["-qr", archivePath, "pack.json", ...Object.keys(files ?? {})], {
        cwd: stagingDir,
      });
      fs.rmSync(stagingDir, { recursive: true, force: true });
      const archive = fs.readFileSync(archivePath);
      // The Registry index carries the member constraints the resolver reads;
      // the archive manifest must agree with it for the accepted identity to
      // match the realized package.
      return {
        version,
        published: published ?? PUBLISHED_AT,
        integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
        dependencies,
      };
    });
    fs.writeFileSync(
      path.join(packDir, "index.json"),
      `${JSON.stringify(
        {
          owner: OWNER,
          type: "pack",
          name,
          publisherBindingId: "hbnd_test",
          deprecation: null,
          versions: newestFirst(entries),
        },
        null,
        2,
      )}\n`,
    );
  };

  const writeKnowledge = (
    name: string,
    versions: ReadonlyArray<RegistryKnowledgeVersion>,
  ): void => {
    const knowledgeDir = path.join(root, "extensions", OWNER, "knowledge", name);
    const entries = versions.map(({ version, body, published }) => {
      const stagingDir = path.join(knowledgeDir, `staging-${version}`);
      fs.mkdirSync(path.join(stagingDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(stagingDir, "knowledge.json"),
        `${JSON.stringify(
          {
            owner: OWNER,
            type: "knowledge",
            name,
            version,
            description: `The ${name} knowledge bundle.`,
            format: { name: "okf", version: "0.2" },
            bundleRoot: "src",
          },
          null,
          2,
        )}\n`,
      );
      fs.writeFileSync(
        path.join(stagingDir, "src", "index.md"),
        `---\nokf_version: "0.2"\ndescription: "The ${name} knowledge bundle."\n---\n\n# ${name}\n\n${body}\n`,
      );
      const archivePath = path.join(knowledgeDir, `${version}.zip`);
      execFileSync("zip", ["-qr", archivePath, "knowledge.json", "src"], { cwd: stagingDir });
      fs.rmSync(stagingDir, { recursive: true, force: true });
      const archive = fs.readFileSync(archivePath);
      return {
        version,
        published: published ?? PUBLISHED_AT,
        integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
      };
    });
    fs.writeFileSync(
      path.join(knowledgeDir, "index.json"),
      `${JSON.stringify(
        {
          owner: OWNER,
          type: "knowledge",
          name,
          publisherBindingId: "hbnd_test",
          deprecation: null,
          versions: newestFirst(entries),
        },
        null,
        2,
      )}\n`,
    );
  };

  return {
    root,
    source: { name: "agentxm", type: "registry", location: `file://${root}` },
    writeSkill,
    writeMcp,
    writePack,
    writeKnowledge,
    cleanup: (): void => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
};
