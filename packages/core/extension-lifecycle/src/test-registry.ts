// @effect-diagnostics globalDate:off — ZIP's driver API requires one fixed Date value and never reads the ambient clock
/**
 * A file-backed Registry a specification can publish into.
 *
 * Writes the real Registry directory layout — a per-extension index plus
 * version archives with genuine integrity hashes — that the production
 * source-resolution layer reads over `file://`. Publication instants predate
 * the deterministic test clock by more than the default minimum release age,
 * so every written version is immediately eligible; rewriting an extension
 * with a longer version list models a later publication.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import { strToU8, zipSync } from "fflate";

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

export interface RegistrySubagentVersion {
  readonly version: string;
  /** Body text of the subagent document, so versions are observably distinct. */
  readonly body: string;
  readonly published?: string;
}

export interface RegistryMcpVersion {
  readonly version: string;
  /** Additional package files included in the version archive. */
  readonly files?: Readonly<Record<string, string>>;
  /** Declared environment input, for credential-lifecycle evidence. */
  readonly secretInput?: string;
}

export interface RegistryPackVersion {
  readonly version: string;
  readonly files?: Readonly<Record<string, string>>;
  /** Member constraints keyed by fully qualified name, as the manifest records them. */
  readonly dependencies: Readonly<Record<string, string>>;
  readonly published?: string;
}

export interface RegistryKnowledgeVersion {
  readonly version: string;
  /** Body text of the bundle's root index, so versions are observably distinct. */
  readonly body: string;
  readonly published?: string;
}

export interface RegistryRuleVersion {
  readonly version: string;
  readonly body: string;
  readonly published?: string;
}

export interface RegistryHookVersion {
  readonly version: string;
  readonly published?: string;
}

const PUBLISHED_AT = "1960-01-01T00:00:00Z";
const OWNER = "@acme";
// ZIP stores a local-time DOS timestamp and admits only 1980-2099. Building the
// fixed instant from local components keeps the encoded fields identical in
// every timezone; an instant fixed in UTC falls into 1979 west of Greenwich.
// eslint-disable-next-line no-restricted-syntax -- ZIP's driver API requires Date; this fixed value never reads the ambient clock.
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

export interface LifecycleRegistry {
  /** Absolute Registry root directory. */
  readonly root: string;
  /** The settings `sources` entry that points at this Registry. */
  readonly source: {
    readonly name: string;
    readonly type: "registry";
    readonly location: string;
  };
  readonly writeSkill: (name: string, versions: ReadonlyArray<RegistrySkillVersion>) => void;
  readonly writeSubagent: (name: string, versions: ReadonlyArray<RegistrySubagentVersion>) => void;
  readonly writeRule: (name: string, versions: ReadonlyArray<RegistryRuleVersion>) => void;
  readonly writeHook: (name: string, versions: ReadonlyArray<RegistryHookVersion>) => void;
  readonly writeMcp: (name: string, versions: ReadonlyArray<RegistryMcpVersion>) => void;
  readonly writePack: (name: string, versions: ReadonlyArray<RegistryPackVersion>) => void;
  readonly writeKnowledge: (
    name: string,
    versions: ReadonlyArray<RegistryKnowledgeVersion>,
  ) => void;
  readonly cleanup: () => void;
}

/** Publish into a throwaway `file://` Registry. */
export const makeLifecycleRegistry = (): LifecycleRegistry => {
  const root = fs.realpathSync(
    fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-lifecycle-registry-")),
  );

  const writeArchive = (
    directory: string,
    version: string,
    entries: Readonly<Record<string, string>>,
  ): Uint8Array => {
    fs.mkdirSync(directory, { recursive: true });
    const archive = zipSync(
      Object.fromEntries(
        Object.entries(entries).map(([relative, content]) => [relative, strToU8(content)]),
      ),
      { mtime: ARCHIVE_MTIME },
    );
    fs.writeFileSync(nodePath.join(directory, `${version}.zip`), archive);
    return archive;
  };

  const writeIndex = (directory: string, index: Readonly<Record<string, unknown>>): void => {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(nodePath.join(directory, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  };

  const integrity = (archive: Uint8Array): string =>
    `sha512-${createHash("sha512").update(archive).digest("base64")}`;

  const extensionDirectory = (plural: string, name: string): string =>
    nodePath.join(root, "extensions", OWNER, plural, name);

  const publish = <T extends { readonly version: string; readonly published?: string }>(args: {
    readonly plural: string;
    readonly type: string;
    readonly name: string;
    readonly versions: ReadonlyArray<T>;
    readonly archive: (entry: T) => Readonly<Record<string, string>>;
    readonly extra?: (entry: T) => Readonly<Record<string, unknown>>;
  }): void => {
    const directory = extensionDirectory(args.plural, args.name);
    const entries = args.versions.map((entry) => ({
      version: entry.version,
      published: entry.published ?? PUBLISHED_AT,
      integrity: integrity(writeArchive(directory, entry.version, args.archive(entry))),
      ...(args.extra === undefined ? {} : args.extra(entry)),
    }));
    writeIndex(directory, {
      owner: OWNER,
      type: args.type,
      name: args.name,
      publisherBindingId: "hbnd_test",
      deprecation: null,
      versions: newestFirst(entries),
    });
  };

  const manifest = (contents: Readonly<Record<string, unknown>>): string =>
    `${JSON.stringify(contents, null, 2)}\n`;

  return {
    root,
    source: { name: "agentxm", type: "registry", location: `file://${root}` },
    writeSkill: (name, versions) =>
      publish({
        plural: "skills",
        type: "skill",
        name,
        versions,
        archive: ({ version, body }) => ({
          "skill.json": manifest({
            owner: OWNER,
            type: "skill",
            name,
            version,
            description: `The ${name} skill.`,
          }),
          "src/SKILL.md": `---\nname: "${name}"\ndescription: "The ${name} skill."\n---\n\n# ${name}\n\n${body}\n`,
        }),
      }),
    writeSubagent: (name, versions) =>
      publish({
        plural: "subagents",
        type: "subagent",
        name,
        versions,
        archive: ({ version, body }) => ({
          "subagent.json": manifest({
            owner: OWNER,
            type: "subagent",
            name,
            version,
            description: `The ${name} subagent.`,
          }),
          [`src/${name}.md`]: `---\nname: ${name}\ndescription: The ${name} subagent.\n---\n\n# ${name}\n\n${body}\n`,
        }),
      }),
    writeRule: (name, versions) =>
      publish({
        plural: "rules",
        type: "rule",
        name,
        versions,
        archive: ({ version, body }) => ({
          "rule.json": manifest({
            owner: OWNER,
            type: "rule",
            name,
            version,
            description: `The ${name} rule.`,
          }),
          "src/RULE.md": `Guidance for ${name}: ${body}\n`,
        }),
      }),
    writeHook: (name, versions) =>
      publish({
        plural: "hooks",
        type: "hook",
        name,
        versions,
        archive: ({ version }) => ({
          "hook.json": manifest({
            owner: OWNER,
            type: "hook",
            name,
            version,
            description: `The ${name} hook.`,
            runtime: "bash",
            entrypoint: "src/hook.sh",
            bindings: [{ on: "tool.pre", match: { tools: ["file.write"] } }],
          }),
          "src/hook.sh": `#!/usr/bin/env bash\necho "${name}"\n`,
        }),
      }),
    writeMcp: (name, versions) =>
      publish({
        plural: "mcps",
        type: "mcp-server",
        name,
        versions,
        archive: ({ version, secretInput, files }) => ({
          "mcp.json": manifest({
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
          }),
          ...files,
        }),
      }),
    writePack: (name, versions) =>
      publish({
        plural: "packs",
        type: "pack",
        name,
        versions,
        archive: ({ version, dependencies, files }) => ({
          "pack.json": manifest({
            owner: OWNER,
            type: "pack",
            name,
            version,
            description: `The ${name} pack.`,
            dependencies,
          }),
          ...files,
        }),
        // The index carries the member constraints the resolver reads; the
        // archive manifest must agree with it for the accepted identity to
        // match the realized package.
        extra: ({ dependencies }) => ({ dependencies }),
      }),
    writeKnowledge: (name, versions) =>
      publish({
        plural: "knowledge",
        type: "knowledge",
        name,
        versions,
        archive: ({ version, body }) => ({
          "knowledge.json": manifest({
            owner: OWNER,
            type: "knowledge",
            name,
            version,
            description: `The ${name} knowledge bundle.`,
            format: { name: "okf", version: "0.2" },
            bundleRoot: "src",
          }),
          "src/index.md": `---\nokf_version: "0.2"\ndescription: "The ${name} knowledge bundle."\n---\n\n# ${name}\n\n${body}\n`,
        }),
      }),
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
};
