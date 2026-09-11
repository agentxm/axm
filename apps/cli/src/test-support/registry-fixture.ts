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
import * as path from "node:path";
import { strToU8, zipSync } from "fflate";

import {
  resolveSpecWorkspaceStorage,
  type SpecFileStore,
  type SpecWorkspaceInput,
} from "./install-harness.js";

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
  readonly files: SpecFileStore;
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
// ZIP stores a local-time DOS timestamp and admits only 1980-2099. Building the
// fixed instant from local components keeps the encoded fields identical in
// every timezone; an instant fixed in UTC falls into 1979 west of Greenwich.
const ARCHIVE_MTIME = new Date(1980, 0, 2, 0, 0, 0, 0);

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

export const makeSpecRegistry = (workspace?: SpecWorkspaceInput): SpecRegistry => {
  const storage = resolveSpecWorkspaceStorage(workspace ?? "/tmp");
  const files = storage.files;
  const root = files.makeTempDirectory("axm-spec-registry-");

  const writeArchive = (
    directory: string,
    version: string,
    entries: Readonly<Record<string, string>>,
  ): Uint8Array => {
    files.makeDirectory(directory);
    const archive = zipSync(
      Object.fromEntries(
        Object.entries(entries).map(([relative, content]) => [relative, strToU8(content)]),
      ),
      { mtime: ARCHIVE_MTIME },
    );
    files.writeFile(path.join(directory, `${version}.zip`), archive);
    return archive;
  };

  const writeSkill = (name: string, versions: ReadonlyArray<RegistrySkillVersion>): void => {
    const skillDir = path.join(root, "extensions", OWNER, "skills", name);
    const entries = versions.map(({ version, body, published }) => {
      const archive = writeArchive(skillDir, version, {
        "skill.json": `${JSON.stringify(
          { owner: OWNER, type: "skill", name, version, description: `The ${name} skill.` },
          null,
          2,
        )}\n`,
        "src/SKILL.md": `---\nname: "${name}"\ndescription: "The ${name} skill."\n---\n\n# ${name}\n\n${body}\n`,
      });
      return {
        version,
        published: published ?? PUBLISHED_AT,
        integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
      };
    });
    files.makeDirectory(skillDir);
    files.writeFile(
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
    const entries = versions.map(({ version, secretInput, files: packageFiles }) => {
      const archive = writeArchive(mcpDir, version, {
        "mcp.json": `${JSON.stringify(
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
        ...packageFiles,
      });
      return {
        version,
        published: PUBLISHED_AT,
        integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
      };
    });
    files.makeDirectory(mcpDir);
    files.writeFile(
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
    const entries = versions.map(({ version, dependencies, published, files: packageFiles }) => {
      const archive = writeArchive(packDir, version, {
        "pack.json": `${JSON.stringify(
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
        ...packageFiles,
      });
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
    files.makeDirectory(packDir);
    files.writeFile(
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
      const archive = writeArchive(knowledgeDir, version, {
        "knowledge.json": `${JSON.stringify(
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
        "src/index.md": `---\nokf_version: "0.2"\ndescription: "The ${name} knowledge bundle."\n---\n\n# ${name}\n\n${body}\n`,
      });
      return {
        version,
        published: published ?? PUBLISHED_AT,
        integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
      };
    });
    files.makeDirectory(knowledgeDir);
    files.writeFile(
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
    files,
    source: { name: "agentxm", type: "registry", location: `file://${root}` },
    writeSkill,
    writeMcp,
    writePack,
    writeKnowledge,
    cleanup: (): void => {
      files.remove(root);
    },
  };
};
