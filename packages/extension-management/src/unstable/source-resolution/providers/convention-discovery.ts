import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { makeAppError, type AppError } from "../../app-error/index.js";
import {
  decodeExtensionNameSync,
  type ExtensionName,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import { type ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { discoverManifestPackagesInDir } from "../../extensions/manifest-package-discovery.js";
import {
  DISCOVERY_MAX_DEPTH,
  DISCOVERY_SKIPPED_DIRECTORIES,
} from "@agentxm/extension-model/unstable/discovery-walk";
import { getCommitSha, getTreeSha } from "../../git/index.js";
import { hookPackagesInDir } from "../../hooks/index.js";
import { type HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import {
  KNOWLEDGE_MANIFEST_FILENAME,
  KnowledgeManifestSchema,
} from "@agentxm/extension-model/unstable/knowledge";
import { type KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import { rulePackagesInDir } from "../../rules/index.js";
import { type RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import {
  MANIFEST_FILENAME,
  SubagentManifestSchema,
} from "@agentxm/extension-model/unstable/subagents/manifest-schema";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import {
  MANIFEST_FILENAME as SKILL_MANIFEST_FILENAME,
  SkillManifestSchema,
} from "@agentxm/extension-model/unstable/skills/manifest-schema";
import { parseSkillMd } from "@agentxm/registry-protocol/unstable/content";
import { type SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { fileUrlToPath } from "../file-url.js";
import type { FindOptions } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { GitBasedSource, LocalSource } from "@agentxm/extension-model/unstable/sources/types";

type ExternalSource = GitBasedSource | LocalSource;

// Directory reads reuse the repository's existing sixteen-read archive cap.
// Git metadata probes stay serial because they spawn subprocesses and no
// higher subprocess capacity has been established.
const FILESYSTEM_DISCOVERY_CONCURRENCY = 16;
const GIT_METADATA_CONCURRENCY = 1;

type SubagentDiscovery = {
  readonly type: "subagent";
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly description: Option.Option<string>;
  readonly location: string;
};

type KnowledgeDiscovery = {
  readonly type: "knowledge";
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly location: string;
};

const matchesIdentity = (
  candidate: { readonly owner?: Handle; readonly name: string },
  options: FindOptions,
): boolean => {
  const nameMatch = options.names.length === 0 || options.names.includes(candidate.name);
  const ownerMatch =
    Option.isNone(options.owner) ||
    (candidate.owner !== undefined && candidate.owner === options.owner.value);
  return nameMatch && ownerMatch;
};

const relativeDir = (basePath: string, location: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return path.relative(basePath, fileUrlToPath(location));
  });

const gitTreeShaFor = (
  source: GitBasedSource,
  basePath: string,
  location: string,
): Effect.Effect<string, AppError, Path.Path> =>
  relativeDir(basePath, location).pipe(Effect.flatMap((dir) => getTreeSha(basePath, dir)));

const gitCommitShaFor = (basePath: string): Effect.Effect<string, AppError> =>
  getCommitSha(basePath);

const subPathForSource = (source: ExternalSource): Option.Option<string> => {
  switch (source.type) {
    case "github":
    case "gitlab":
    case "bitbucket":
    case "azurerepos":
      return source.subPath;
    case "git":
    case "local":
      return Option.none();
  }
};

const discoverSkillPackagesInDir = discoverManifestPackagesInDir({
  type: "skill",
  manifestFilename: SKILL_MANIFEST_FILENAME,
  manifestSchema: SkillManifestSchema,
});

type PortableSkillDiscovery = {
  readonly type: "skill";
  readonly name: ExtensionName;
  readonly skill: SkillExtensionRef["skill"];
  readonly location: string;
};

const readPortableSkillDiscovery = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const hasPackageManifest = yield* fs
      .exists(path.join(dir, SKILL_MANIFEST_FILENAME))
      .pipe(Effect.catch(() => Effect.succeed(false)));
    const isAxmPackageContent =
      path.basename(dir) === "src" &&
      (yield* fs
        .exists(path.join(path.dirname(dir), SKILL_MANIFEST_FILENAME))
        .pipe(Effect.catch(() => Effect.succeed(false))));
    if (hasPackageManifest || isAxmPackageContent) {
      return Option.none<PortableSkillDiscovery>();
    }

    const content = yield* fs.readFileString(path.join(dir, "SKILL.md")).pipe(Effect.option);
    if (Option.isNone(content)) return Option.none<PortableSkillDiscovery>();
    const skill = parseSkillMd(content.value, path.basename(dir));
    if (Option.isNone(skill)) return Option.none<PortableSkillDiscovery>();
    const name = decodeExtensionNameSync(skill.value.name);
    return Option.some({
      type: "skill",
      name,
      skill: {
        name,
        description: Option.some(skill.value.description),
        metadata: skill.value.metadata,
      },
      location: `file://${dir}`,
    } satisfies PortableSkillDiscovery);
  });

const portableSkillDiscoveries = (root: string) =>
  Effect.gen(function* () {
    const dirs = yield* manifestDirs(root, "SKILL.md");
    const discoveries = yield* Effect.forEach(dirs, readPortableSkillDiscovery, {
      concurrency: FILESYSTEM_DISCOVERY_CONCURRENCY,
    });
    return discoveries.flatMap((discovery) => (Option.isSome(discovery) ? [discovery.value] : []));
  });

const portableSkillRefsInDir = (source: ExternalSource, basePath: string, options: FindOptions) =>
  Effect.gen(function* () {
    const root = yield* searchRootFor(source, basePath);
    const discoveries = yield* portableSkillDiscoveries(root);
    const matching = discoveries.filter((discovery) => matchesIdentity(discovery, options));
    return yield* Effect.forEach(
      matching,
      (discovery) =>
        Effect.gen(function* () {
          const sourcePath = yield* relativeDir(basePath, discovery.location);
          switch (source.type) {
            case "local":
              return {
                type: "skill",
                refType: "local",
                name: discovery.name,
                skill: discovery.skill,
                source,
                sourcePath,
                portable: true,
                location: discovery.location,
              } satisfies SkillExtensionRef;
            case "github":
            case "gitlab":
            case "bitbucket":
            case "azurerepos":
            case "git":
              return {
                type: "skill",
                refType: "git-hosted",
                name: discovery.name,
                skill: discovery.skill,
                source,
                sourcePath,
                portable: true,
                location: discovery.location,
                gitTreeSha: yield* gitTreeShaFor(source, basePath, discovery.location),
                gitCommitSha: yield* gitCommitShaFor(basePath),
              } satisfies SkillExtensionRef;
          }
        }),
      { concurrency: GIT_METADATA_CONCURRENCY },
    );
  });

const skillRefsInDir = (source: ExternalSource, basePath: string, options: FindOptions) =>
  searchRootFor(source, basePath).pipe(
    Effect.flatMap((root) => discoverSkillPackagesInDir(root, { fullDepth: true })),
    Effect.flatMap((skills) =>
      Effect.forEach(
        skills.filter(({ manifest }) => matchesIdentity(manifest, options)),
        (discovered) =>
          Effect.gen(function* () {
            const skill = {
              name: discovered.manifest.name,
              description: Option.fromUndefinedOr(discovered.manifest.description),
              metadata: Option.none(),
            };
            const identity = {
              owner: discovered.manifest.owner,
              name: discovered.manifest.name,
            };
            switch (source.type) {
              case "local":
                return {
                  type: "skill",
                  refType: "local",
                  skill,
                  ...identity,
                  source,
                  location: discovered.location,
                  sourcePath: yield* relativeDir(basePath, discovered.location),
                } satisfies SkillExtensionRef;
              case "github":
              case "gitlab":
              case "bitbucket":
              case "azurerepos":
              case "git":
                return {
                  type: "skill",
                  refType: "git-hosted",
                  skill,
                  ...identity,
                  source,
                  location: discovered.location,
                  sourcePath: yield* relativeDir(basePath, discovered.location),
                  gitTreeSha: yield* gitTreeShaFor(source, basePath, discovered.location),
                  gitCommitSha: yield* gitCommitShaFor(basePath),
                } satisfies SkillExtensionRef;
            }
          }),
        { concurrency: GIT_METADATA_CONCURRENCY },
      ),
    ),
  );

const searchRootFor = (source: ExternalSource, basePath: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    if (source.type === "local") return source.path;
    return Option.match(subPathForSource(source), {
      onNone: () => basePath,
      onSome: (subPath) => path.join(basePath, subPath),
    });
  });

const manifestDirs = (
  root: string,
  manifestFilename: string,
): Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem | Path.Path> => {
  const scan = (
    dir: string,
    depth: number,
  ): Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem | Path.Path> =>
    Effect.gen(function* () {
      if (depth > DISCOVERY_MAX_DEPTH) return [];
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
      if (Option.isNone(entries)) return [];

      const hasManifest = entries.value.includes(manifestFilename);
      const childDirs = yield* Effect.forEach(
        entries.value,
        (entry) =>
          Effect.gen(function* () {
            if (DISCOVERY_SKIPPED_DIRECTORIES.has(entry)) return [];
            const fullPath = path.join(dir, entry);
            const stat = yield* fs.stat(fullPath).pipe(Effect.option);
            if (Option.isNone(stat) || stat.value.type !== "Directory") return [];
            return yield* scan(fullPath, depth + 1);
          }),
        { concurrency: FILESYSTEM_DISCOVERY_CONCURRENCY },
      ).pipe(Effect.map((results) => Array.flatten(results)));

      return hasManifest ? [dir, ...childDirs] : childDirs;
    });

  return scan(root, 0);
};

const readSubagentDiscovery = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestPath = path.join(dir, MANIFEST_FILENAME);
    const raw = yield* fs.readFileString(manifestPath).pipe(Effect.option);
    if (Option.isNone(raw)) return Option.none<SubagentDiscovery>();
    const json = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
      raw.value,
    ).pipe(Effect.option);
    if (Option.isNone(json)) return Option.none<SubagentDiscovery>();
    const manifest = yield* Schema.decodeUnknownEffect(SubagentManifestSchema)(json.value).pipe(
      Effect.option,
    );
    if (Option.isNone(manifest)) return Option.none<SubagentDiscovery>();
    return Option.some({
      type: "subagent",
      owner: manifest.value.owner,
      name: manifest.value.name,
      description: Option.fromUndefinedOr(manifest.value.description),
      location: `file://${dir}`,
    } satisfies SubagentDiscovery);
  });

const readKnowledgeDiscovery = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestPath = path.join(dir, KNOWLEDGE_MANIFEST_FILENAME);
    const raw = yield* fs.readFileString(manifestPath).pipe(Effect.option);
    if (Option.isNone(raw)) return Option.none<KnowledgeDiscovery>();
    const json = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
      raw.value,
    ).pipe(Effect.option);
    if (Option.isNone(json)) return Option.none<KnowledgeDiscovery>();
    const manifest = yield* Schema.decodeUnknownEffect(KnowledgeManifestSchema)(json.value).pipe(
      Effect.option,
    );
    if (Option.isNone(manifest)) return Option.none<KnowledgeDiscovery>();
    return Option.some({
      type: "knowledge",
      owner: manifest.value.owner,
      name: manifest.value.name,
      location: `file://${dir}`,
    } satisfies KnowledgeDiscovery);
  });

const subagentDiscoveries = (
  root: string,
): Effect.Effect<ReadonlyArray<SubagentDiscovery>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const dirs = yield* manifestDirs(root, MANIFEST_FILENAME);
    const discoveries = yield* Effect.forEach(dirs, (dir) => readSubagentDiscovery(dir), {
      concurrency: FILESYSTEM_DISCOVERY_CONCURRENCY,
    });
    return discoveries.flatMap((discovery) => (Option.isSome(discovery) ? [discovery.value] : []));
  });

const knowledgeDiscoveries = (
  root: string,
): Effect.Effect<ReadonlyArray<KnowledgeDiscovery>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const dirs = yield* manifestDirs(root, KNOWLEDGE_MANIFEST_FILENAME);
    const discoveries = yield* Effect.forEach(dirs, (dir) => readKnowledgeDiscovery(dir), {
      concurrency: FILESYSTEM_DISCOVERY_CONCURRENCY,
    });
    return discoveries.flatMap((discovery) => (Option.isSome(discovery) ? [discovery.value] : []));
  });

const subagentRef = (source: ExternalSource, basePath: string, discovery: SubagentDiscovery) =>
  Effect.gen(function* () {
    const subagent = { name: discovery.name, description: discovery.description };
    const identity = { owner: discovery.owner, name: discovery.name };
    switch (source.type) {
      case "local":
        return {
          type: "subagent",
          refType: "local",
          subagent,
          ...identity,
          source,
          location: discovery.location,
          sourcePath: yield* relativeDir(basePath, discovery.location),
        } satisfies SubagentExtensionRef;
      case "github":
      case "gitlab":
      case "bitbucket":
      case "azurerepos":
      case "git":
        return {
          type: "subagent",
          refType: "git-hosted",
          subagent,
          ...identity,
          source,
          location: discovery.location,
          sourcePath: yield* relativeDir(basePath, discovery.location),
          gitTreeSha: yield* gitTreeShaFor(source, basePath, discovery.location),
          gitCommitSha: yield* gitCommitShaFor(basePath),
        } satisfies SubagentExtensionRef;
    }
  });

const knowledgeRef = (source: ExternalSource, basePath: string, discovery: KnowledgeDiscovery) =>
  Effect.gen(function* () {
    const knowledge = { name: discovery.name };
    const identity = { owner: discovery.owner, name: discovery.name };
    switch (source.type) {
      case "local":
        return {
          type: "knowledge",
          refType: "local",
          knowledge,
          ...identity,
          source,
          location: discovery.location,
          sourcePath: yield* relativeDir(basePath, discovery.location),
        } satisfies KnowledgeExtensionRef;
      case "github":
      case "gitlab":
      case "bitbucket":
      case "azurerepos":
      case "git":
        return {
          type: "knowledge",
          refType: "git-hosted",
          knowledge,
          ...identity,
          source,
          location: discovery.location,
          sourcePath: yield* relativeDir(basePath, discovery.location),
          gitTreeSha: yield* gitTreeShaFor(source, basePath, discovery.location),
          gitCommitSha: yield* gitCommitShaFor(basePath),
        } satisfies KnowledgeExtensionRef;
    }
  });

const subagentRefsInDir = (source: ExternalSource, basePath: string, options: FindOptions) =>
  Effect.gen(function* () {
    const root = yield* searchRootFor(source, basePath);
    const discoveries = yield* subagentDiscoveries(root);
    const matching = discoveries.filter((discovery) => matchesIdentity(discovery, options));
    return yield* Effect.forEach(
      matching,
      (discovery) => subagentRef(source, basePath, discovery),
      { concurrency: GIT_METADATA_CONCURRENCY },
    );
  });

const knowledgeRefsInDir = (source: ExternalSource, basePath: string, options: FindOptions) =>
  Effect.gen(function* () {
    const root = yield* searchRootFor(source, basePath);
    const discoveries = yield* knowledgeDiscoveries(root);
    const matching = discoveries.filter((discovery) => matchesIdentity(discovery, options));
    return yield* Effect.forEach(
      matching,
      (discovery) => knowledgeRef(source, basePath, discovery),
      { concurrency: GIT_METADATA_CONCURRENCY },
    );
  });

const ruleRefsInDir = (source: ExternalSource, basePath: string, options: FindOptions) =>
  Effect.gen(function* () {
    const root = yield* searchRootFor(source, basePath);
    const discovered = yield* rulePackagesInDir(root, { fullDepth: true });
    const matching = discovered.filter(({ manifest }) => matchesIdentity(manifest, options));
    return yield* Effect.forEach(
      matching,
      (discovery) =>
        Effect.gen(function* () {
          const rule = { name: discovery.manifest.name };
          const identity = {
            owner: discovery.manifest.owner,
            name: discovery.manifest.name,
          };
          switch (source.type) {
            case "local":
              return {
                type: "rule",
                refType: "local",
                rule,
                ...identity,
                source,
                location: discovery.location,
                sourcePath: yield* relativeDir(basePath, discovery.location),
              } satisfies RuleExtensionRef;
            case "github":
            case "gitlab":
            case "bitbucket":
            case "azurerepos":
            case "git":
              return {
                type: "rule",
                refType: "git-hosted",
                rule,
                ...identity,
                source,
                location: discovery.location,
                sourcePath: yield* relativeDir(basePath, discovery.location),
                gitTreeSha: yield* gitTreeShaFor(source, basePath, discovery.location),
                gitCommitSha: yield* gitCommitShaFor(basePath),
              } satisfies RuleExtensionRef;
          }
        }),
      { concurrency: GIT_METADATA_CONCURRENCY },
    );
  });

const hookRefsInDir = (source: ExternalSource, basePath: string, options: FindOptions) =>
  Effect.gen(function* () {
    const root = yield* searchRootFor(source, basePath);
    const discovered = yield* hookPackagesInDir(root, { fullDepth: true });
    const matching = discovered.filter(({ manifest }) => matchesIdentity(manifest, options));
    return yield* Effect.forEach(
      matching,
      (discovery) =>
        Effect.gen(function* () {
          const hook = { name: discovery.manifest.name };
          const identity = {
            owner: discovery.manifest.owner,
            name: discovery.manifest.name,
          };
          switch (source.type) {
            case "local":
              return {
                type: "hook",
                refType: "local",
                hook,
                ...identity,
                source,
                location: discovery.location,
                sourcePath: yield* relativeDir(basePath, discovery.location),
              } satisfies HookExtensionRef;
            case "github":
            case "gitlab":
            case "bitbucket":
            case "azurerepos":
            case "git":
              return {
                type: "hook",
                refType: "git-hosted",
                hook,
                ...identity,
                source,
                location: discovery.location,
                sourcePath: yield* relativeDir(basePath, discovery.location),
                gitTreeSha: yield* gitTreeShaFor(source, basePath, discovery.location),
                gitCommitSha: yield* gitCommitShaFor(basePath),
              } satisfies HookExtensionRef;
          }
        }),
      { concurrency: GIT_METADATA_CONCURRENCY },
    );
  });

const identityKey = (ref: ExtensionRef): string | undefined => {
  switch (ref.type) {
    case "subagent":
      return `${ref.type}:${ref.subagent.name}`;
    case "rule":
      return `${ref.type}:${ref.rule.name}`;
    case "hook":
      return `${ref.type}:${ref.hook.name}`;
    case "knowledge":
      return `${ref.type}:${ref.knowledge.name}`;
    case "skill":
      return `${ref.type}:${ref.skill.name}`;
    case "mcp-server":
      return `${ref.type}:${ref.server.name}`;
    case "pack":
      return `${ref.type}:${ref.owner}:${ref.pack.name}`;
  }
};

const rejectAmbiguousDuplicates = (refs: ReadonlyArray<ExtensionRef>) =>
  Effect.gen(function* () {
    const seen = new Set<string>();
    for (const ref of refs) {
      const key = identityKey(ref);
      if (key === undefined) continue;
      if (seen.has(key)) {
        return yield* makeAppError({
          code: "validation",
          detail: `Multiple discovered extensions declare the same identity: ${key}`,
        });
      }
      seen.add(key);
    }
    return refs;
  });

export const discoverConventionRefs = (
  source: ExternalSource,
  basePath: string,
  options: FindOptions,
): Effect.Effect<ReadonlyArray<ExtensionRef>, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const refs: ReadonlyArray<ExtensionRef> = [
      ...(options.type === "skill" || options.type === "*"
        ? [
            ...(yield* skillRefsInDir(source, basePath, options)),
            ...(yield* portableSkillRefsInDir(source, basePath, options)),
          ]
        : []),
      ...(options.type === "subagent" || options.type === "*"
        ? yield* subagentRefsInDir(source, basePath, options)
        : []),
      ...(options.type === "rule" || options.type === "*"
        ? yield* ruleRefsInDir(source, basePath, options)
        : []),
      ...(options.type === "hook" || options.type === "*"
        ? yield* hookRefsInDir(source, basePath, options)
        : []),
      ...(options.type === "knowledge" || options.type === "*"
        ? yield* knowledgeRefsInDir(source, basePath, options)
        : []),
    ];

    return yield* rejectAmbiguousDuplicates(refs);
  });
