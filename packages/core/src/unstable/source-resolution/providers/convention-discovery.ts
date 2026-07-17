import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { makeAppError, type AppError } from "../../app-error/index.js";
import { type ExtensionName, type ExtensionRef, type Handle } from "../../extensions/index.js";
import {
  DISCOVERY_MAX_DEPTH,
  DISCOVERY_SKIPPED_DIRECTORIES,
} from "../../extensions/discovery-walk.js";
import { COMMAND_MANIFEST_FILENAME, CommandManifestSchema } from "../../commands/index.js";
import type { CommandExtensionRef } from "../../commands/index.js";
import { filesPackagesInDir, type FilesExtensionRef } from "../../files/index.js";
import { getTreeSha } from "../../git/index.js";
import { hookPackagesInDir, type HookExtensionRef } from "../../hooks/index.js";
import {
  KNOWLEDGE_MANIFEST_FILENAME,
  KnowledgeManifestSchema,
  type KnowledgeExtensionRef,
} from "../../knowledge/index.js";
import { rulePackagesInDir, type RuleExtensionRef } from "../../rules/index.js";
import { MANIFEST_FILENAME, SubagentManifestSchema } from "../../subagents/manifest-schema.js";
import type { SubagentExtensionRef } from "../../subagents/index.js";
import { normalizeExtensionName } from "../../extensions/index.js";
import { skillsInDir } from "../../workspace/read-model/discovery/index.js";
import type { SkillExtensionRef } from "../../skills/index.js";
import { fileUrlToPath } from "../../sources/index.js";
import type { FindOptions, GitBasedSource, LocalSource } from "../../sources/index.js";

type ExternalSource = GitBasedSource | LocalSource;

type CommandDiscovery = {
  readonly type: "command";
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly location: string;
};

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

const matchesSkillIdentity = (
  candidate: { readonly rawName: string; readonly normalizedName: ExtensionName },
  options: FindOptions,
): boolean =>
  options.names.length === 0 ||
  options.names.includes(candidate.rawName) ||
  options.names.includes(candidate.normalizedName);

const relativeDir = (basePath: string, location: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return path.relative(basePath, fileUrlToPath(location));
  });

const gitTreeShaFor = (
  source: GitBasedSource,
  basePath: string,
  location: string,
): Effect.Effect<Option.Option<string>, never, Path.Path> =>
  relativeDir(basePath, location).pipe(
    Effect.flatMap((dir) => getTreeSha(basePath, dir)),
    Effect.option,
  );

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

const skillRefsInDir = (source: ExternalSource, basePath: string, options: FindOptions) =>
  skillsInDir(basePath, subPathForSource(source), {
    fullDepth: true,
    includeInternal: false,
  }).pipe(
    Effect.flatMap((skills) =>
      Effect.forEach(
        skills.filter(({ skill }) =>
          matchesSkillIdentity(
            { rawName: skill.name, normalizedName: normalizeExtensionName(skill.name) },
            options,
          ),
        ),
        (discovered) =>
          Effect.gen(function* () {
            const skill = {
              name: normalizeExtensionName(discovered.skill.name),
              description: Option.some(discovered.skill.description),
              metadata: discovered.skill.metadata,
            };
            switch (source.type) {
              case "local":
                return {
                  type: "skill",
                  refType: "local",
                  skill,
                  source,
                  location: discovered.location,
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
                  source,
                  location: discovered.location,
                  sourcePath: yield* relativeDir(basePath, discovered.location),
                  gitTreeSha: yield* gitTreeShaFor(source, basePath, discovered.location),
                } satisfies SkillExtensionRef;
            }
          }),
        { concurrency: "unbounded" },
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
        { concurrency: "unbounded" },
      ).pipe(Effect.map((results) => Array.flatten(results)));

      return hasManifest ? [dir, ...childDirs] : childDirs;
    });

  return scan(root, 0);
};

const readCommandDiscovery = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestPath = path.join(dir, COMMAND_MANIFEST_FILENAME);
    const raw = yield* fs.readFileString(manifestPath).pipe(Effect.option);
    if (Option.isNone(raw)) return Option.none<CommandDiscovery>();
    const json = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(raw.value).pipe(
      Effect.option,
    );
    if (Option.isNone(json)) return Option.none<CommandDiscovery>();
    const manifest = yield* Schema.decodeUnknownEffect(CommandManifestSchema)(json.value).pipe(
      Effect.option,
    );
    if (Option.isNone(manifest)) return Option.none<CommandDiscovery>();
    return Option.some({
      type: "command",
      owner: manifest.value.owner,
      name: manifest.value.name,
      location: `file://${dir}`,
    } satisfies CommandDiscovery);
  });

const readSubagentDiscovery = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestPath = path.join(dir, MANIFEST_FILENAME);
    const raw = yield* fs.readFileString(manifestPath).pipe(Effect.option);
    if (Option.isNone(raw)) return Option.none<SubagentDiscovery>();
    const json = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(raw.value).pipe(
      Effect.option,
    );
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
    const json = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(raw.value).pipe(
      Effect.option,
    );
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

const commandDiscoveries = (
  root: string,
): Effect.Effect<ReadonlyArray<CommandDiscovery>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const dirs = yield* manifestDirs(root, COMMAND_MANIFEST_FILENAME);
    const discoveries = yield* Effect.forEach(dirs, (dir) => readCommandDiscovery(dir), {
      concurrency: "unbounded",
    });
    return discoveries.flatMap((discovery) => (Option.isSome(discovery) ? [discovery.value] : []));
  });

const subagentDiscoveries = (
  root: string,
): Effect.Effect<ReadonlyArray<SubagentDiscovery>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const dirs = yield* manifestDirs(root, MANIFEST_FILENAME);
    const discoveries = yield* Effect.forEach(dirs, (dir) => readSubagentDiscovery(dir), {
      concurrency: "unbounded",
    });
    return discoveries.flatMap((discovery) => (Option.isSome(discovery) ? [discovery.value] : []));
  });

const knowledgeDiscoveries = (
  root: string,
): Effect.Effect<ReadonlyArray<KnowledgeDiscovery>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const dirs = yield* manifestDirs(root, KNOWLEDGE_MANIFEST_FILENAME);
    const discoveries = yield* Effect.forEach(dirs, (dir) => readKnowledgeDiscovery(dir), {
      concurrency: "unbounded",
    });
    return discoveries.flatMap((discovery) => (Option.isSome(discovery) ? [discovery.value] : []));
  });

const commandRef = (source: ExternalSource, basePath: string, discovery: CommandDiscovery) =>
  Effect.gen(function* () {
    const command = { name: discovery.name };
    switch (source.type) {
      case "local":
        return {
          type: "command",
          refType: "local",
          command,
          source,
          location: discovery.location,
        } satisfies CommandExtensionRef;
      case "github":
      case "gitlab":
      case "bitbucket":
      case "azurerepos":
      case "git":
        return {
          type: "command",
          refType: "git-hosted",
          command,
          source,
          location: discovery.location,
          gitTreeSha: yield* gitTreeShaFor(source, basePath, discovery.location),
        } satisfies CommandExtensionRef;
    }
  });

const subagentRef = (source: ExternalSource, basePath: string, discovery: SubagentDiscovery) =>
  Effect.gen(function* () {
    const subagent = { name: discovery.name, description: discovery.description };
    switch (source.type) {
      case "local":
        return {
          type: "subagent",
          refType: "local",
          subagent,
          source,
          location: discovery.location,
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
          source,
          location: discovery.location,
          gitTreeSha: yield* gitTreeShaFor(source, basePath, discovery.location),
        } satisfies SubagentExtensionRef;
    }
  });

const knowledgeRef = (source: ExternalSource, basePath: string, discovery: KnowledgeDiscovery) =>
  Effect.gen(function* () {
    const knowledge = { name: discovery.name };
    switch (source.type) {
      case "local":
        return {
          type: "knowledge",
          refType: "local",
          knowledge,
          source,
          location: discovery.location,
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
          source,
          location: discovery.location,
          sourcePath: yield* relativeDir(basePath, discovery.location),
          gitTreeSha: yield* gitTreeShaFor(source, basePath, discovery.location),
        } satisfies KnowledgeExtensionRef;
    }
  });

const commandRefsInDir = (source: ExternalSource, basePath: string, options: FindOptions) =>
  Effect.gen(function* () {
    const root = yield* searchRootFor(source, basePath);
    const discoveries = yield* commandDiscoveries(root);
    const matching = discoveries.filter((discovery) => matchesIdentity(discovery, options));
    return yield* Effect.forEach(matching, (discovery) => commandRef(source, basePath, discovery), {
      concurrency: "unbounded",
    });
  });

const subagentRefsInDir = (source: ExternalSource, basePath: string, options: FindOptions) =>
  Effect.gen(function* () {
    const root = yield* searchRootFor(source, basePath);
    const discoveries = yield* subagentDiscoveries(root);
    const matching = discoveries.filter((discovery) => matchesIdentity(discovery, options));
    return yield* Effect.forEach(
      matching,
      (discovery) => subagentRef(source, basePath, discovery),
      { concurrency: "unbounded" },
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
      { concurrency: "unbounded" },
    );
  });

const filesRefsInDir = (source: ExternalSource, basePath: string, options: FindOptions) =>
  Effect.gen(function* () {
    const root = yield* searchRootFor(source, basePath);
    const discovered = yield* filesPackagesInDir(root, { fullDepth: true });
    const matching = discovered.filter(({ manifest }) => matchesIdentity(manifest, options));
    return yield* Effect.forEach(
      matching,
      (discovery) =>
        Effect.gen(function* () {
          const file = { name: discovery.manifest.name };
          switch (source.type) {
            case "local":
              return {
                type: "files",
                refType: "local",
                file,
                source,
                location: discovery.location,
              } satisfies FilesExtensionRef;
            case "github":
            case "gitlab":
            case "bitbucket":
            case "azurerepos":
            case "git":
              return {
                type: "files",
                refType: "git-hosted",
                file,
                source,
                location: discovery.location,
                gitTreeSha: yield* gitTreeShaFor(source, basePath, discovery.location),
              } satisfies FilesExtensionRef;
          }
        }),
      { concurrency: "unbounded" },
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
          switch (source.type) {
            case "local":
              return {
                type: "rule",
                refType: "local",
                rule,
                source,
                location: discovery.location,
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
                source,
                location: discovery.location,
                gitTreeSha: yield* gitTreeShaFor(source, basePath, discovery.location),
              } satisfies RuleExtensionRef;
          }
        }),
      { concurrency: "unbounded" },
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
          switch (source.type) {
            case "local":
              return {
                type: "hook",
                refType: "local",
                hook,
                source,
                location: discovery.location,
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
                source,
                location: discovery.location,
                gitTreeSha: yield* gitTreeShaFor(source, basePath, discovery.location),
              } satisfies HookExtensionRef;
          }
        }),
      { concurrency: "unbounded" },
    );
  });

const identityKey = (ref: ExtensionRef): string | undefined => {
  switch (ref.type) {
    case "command":
      return `${ref.type}:${ref.command.name}`;
    case "subagent":
      return `${ref.type}:${ref.subagent.name}`;
    case "files":
      return `${ref.type}:${ref.file.name}`;
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
        ? yield* skillRefsInDir(source, basePath, options)
        : []),
      ...(options.type === "command" || options.type === "*"
        ? yield* commandRefsInDir(source, basePath, options)
        : []),
      ...(options.type === "subagent" || options.type === "*"
        ? yield* subagentRefsInDir(source, basePath, options)
        : []),
      ...(options.type === "files" || options.type === "*"
        ? yield* filesRefsInDir(source, basePath, options)
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
