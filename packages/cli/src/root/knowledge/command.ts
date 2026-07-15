import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer, type TableView } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  KNOWLEDGE_EXTENSION_DIR,
  KNOWLEDGE_SOURCE_DIR,
  inspectKnowledgeBundle,
  KnowledgeManager,
  KnowledgeManagerLive,
  openKnowledgeConcept,
  searchKnowledgeConcepts,
  type KnowledgeDiagnostic,
} from "@agentxm/client-core/unstable/knowledge";
import type { KnowledgeLockEntry } from "@agentxm/client-core/unstable/lockfile";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
} from "@agentxm/client-core/unstable/extensions";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";

import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { newCommand } from "./new.js";

const ConceptSchema = Schema.Struct({
  bundle: Schema.String,
  id: Schema.String,
  title: Schema.String,
  type: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  tags: Schema.optional(Schema.Array(Schema.String)),
  relativePath: Schema.String,
  body: Schema.String,
});

const DiagnosticSchema = Schema.Struct({
  bundle: Schema.String,
  code: Schema.String,
  severity: Schema.String,
  relativePath: Schema.String,
  message: Schema.String,
});

const BundleSchema = Schema.Struct({
  name: Schema.String,
  sourceRoot: Schema.String,
  concepts: Schema.Number,
  diagnostics: Schema.Number,
});

const KnowledgeListQueryResultSchema = Schema.Struct({ bundles: Schema.Array(BundleSchema) });
const KnowledgeSearchQueryResultSchema = Schema.Struct({
  query: Schema.String,
  concepts: Schema.Array(ConceptSchema),
});
const KnowledgeOpenQueryResultSchema = Schema.Struct({ concept: ConceptSchema });
const KnowledgeLintQueryResultSchema = Schema.Struct({
  valid: Schema.Boolean,
  diagnostics: Schema.Array(DiagnosticSchema),
});

interface BundleRow {
  readonly name: string;
  readonly concepts: number;
  readonly diagnostics: number;
  readonly sourceRoot: string;
}

interface ConceptRow {
  readonly bundle: string;
  readonly id: string;
  readonly title: string;
  readonly type: string;
}

const BundleTable = {
  columns: {
    name: { header: "Bundle" },
    concepts: { header: "Concepts" },
    diagnostics: { header: "Diagnostics" },
    sourceRoot: { header: "Source" },
  },
} as const satisfies TableView<BundleRow>;

const ConceptTable = {
  columns: {
    bundle: { header: "Bundle" },
    id: { header: "Concept" },
    title: { header: "Title" },
    type: { header: "Type" },
  },
} as const satisfies TableView<ConceptRow>;

const bundleRoot = (
  baseDir: string,
  name: string,
  entry: KnowledgeLockEntry,
  path: Path.Path,
): string =>
  entry.type === "registry" || entry.type === "workspace"
    ? path.join(
        baseDir,
        REGISTRY_EXTENSIONS_DIR,
        entry.owner,
        KNOWLEDGE_EXTENSION_DIR,
        name,
        KNOWLEDGE_SOURCE_DIR,
      )
    : path.join(
        baseDir,
        EXTERNAL_EXTENSIONS_DIR,
        KNOWLEDGE_EXTENSION_DIR,
        name,
        KNOWLEDGE_SOURCE_DIR,
      );

const inspectInstalledKnowledge = Effect.fn("Knowledge.inspectInstalled")(function* (
  selectedName?: string,
) {
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;
  const locked = yield* ws.getLockedKnowledge();
  const configured = yield* ws.getConfiguredKnowledgeEntries();
  const entries = Object.entries(locked)
    .filter(
      ([name]) =>
        (selectedName === undefined || name === selectedName) &&
        configured[name]?.enabled !== false,
    )
    .sort(([left], [right]) => left.localeCompare(right));
  if (selectedName !== undefined && entries.length === 0) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Knowledge bundle "${selectedName}" is not installed`,
    });
  }
  return yield* Effect.forEach(
    entries,
    ([name, entry]) => {
      const sourceRoot = bundleRoot(ws.baseDir, name, entry, path);
      return inspectKnowledgeBundle(sourceRoot).pipe(
        Effect.map((inspection) => ({ name, sourceRoot, inspection })),
        Effect.mapError((cause) =>
          makeAppError({
            code: "validation",
            detail: `Failed to inspect knowledge bundle "${name}"`,
            cause,
          }),
        ),
      );
    },
    { concurrency: "unbounded" },
  );
});

export const handleKnowledgeList = Effect.fn("Knowledge.list")(function* () {
  const renderer = yield* CliRenderer;
  const bundles = yield* inspectInstalledKnowledge();
  const rows = bundles.map(({ name, sourceRoot, inspection }) => ({
    name,
    sourceRoot,
    concepts: inspection.concepts.length,
    diagnostics: inspection.diagnostics.length,
  }));
  if (yield* renderer.result({ bundles: rows }, KnowledgeListQueryResultSchema)) return;
  if (rows.length === 0) {
    yield* renderer.info("No knowledge bundles installed");
    return;
  }
  yield* renderer.table(
    rows,
    BundleTable,
    `${rows.length} knowledge bundle${rows.length === 1 ? "" : "s"}`,
  );
});

export const handleKnowledgeSearch = Effect.fn("Knowledge.search")(function* (query: string) {
  const renderer = yield* CliRenderer;
  const bundles = yield* inspectInstalledKnowledge();
  const concepts = bundles.flatMap(({ name, inspection }) =>
    searchKnowledgeConcepts(inspection.concepts, query).map((concept) => ({
      bundle: name,
      ...concept,
    })),
  );
  if (yield* renderer.result({ query, concepts }, KnowledgeSearchQueryResultSchema)) return;
  const rows = concepts.map((concept) => ({
    bundle: concept.bundle,
    id: concept.id,
    title: concept.title,
    type: concept.type ?? "—",
  }));
  if (rows.length === 0) {
    yield* renderer.info(`No knowledge concepts matched "${query}"`);
    return;
  }
  yield* renderer.table(
    rows,
    ConceptTable,
    `${rows.length} matching concept${rows.length === 1 ? "" : "s"}`,
  );
});

export const handleKnowledgeOpen = Effect.fn("Knowledge.open")(function* (
  bundleName: string,
  conceptId: string,
) {
  const renderer = yield* CliRenderer;
  const [bundle] = yield* inspectInstalledKnowledge(bundleName);
  if (bundle === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Knowledge bundle "${bundleName}" is not installed`,
    });
  }
  const concept = openKnowledgeConcept(bundle.inspection.concepts, conceptId);
  if (concept === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Knowledge concept "${conceptId}" was not found in "${bundleName}"`,
    });
  }
  const output = { concept: { bundle: bundleName, ...concept } };
  if (yield* renderer.result(output, KnowledgeOpenQueryResultSchema)) return;
  yield* renderer.diagnostic(concept.body);
});

const flattenDiagnostics = (
  bundles: ReadonlyArray<{
    readonly name: string;
    readonly inspection: { readonly diagnostics: ReadonlyArray<KnowledgeDiagnostic> };
  }>,
) =>
  bundles.flatMap(({ name, inspection }) =>
    inspection.diagnostics.map((item) => ({ bundle: name, ...item })),
  );

export const handleKnowledgeLint = Effect.fn("Knowledge.lint")(function* (name?: string) {
  const renderer = yield* CliRenderer;
  const bundles = yield* inspectInstalledKnowledge(name);
  const diagnostics = flattenDiagnostics(bundles);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const result = { valid: errors.length === 0, diagnostics };
  if (!(yield* renderer.result(result, KnowledgeLintQueryResultSchema))) {
    if (diagnostics.length === 0) {
      yield* renderer.success(
        `Knowledge validation passed for ${bundles.length} bundle${bundles.length === 1 ? "" : "s"}`,
      );
    } else {
      for (const diagnostic of diagnostics) {
        const message = `${diagnostic.bundle}/${diagnostic.relativePath}: ${diagnostic.message}`;
        if (diagnostic.severity === "error") yield* renderer.error(message);
        else yield* renderer.warn(message);
      }
    }
  }
  if (errors.length > 0) {
    return yield* makeAppError({
      code: "validation",
      detail: `${errors.length} knowledge validation error${errors.length === 1 ? "" : "s"}`,
    });
  }
});

const setKnowledgeEnabled = Effect.fn("Knowledge.setEnabled")(function* (
  name: string,
  enabled: boolean,
) {
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredKnowledgeEntries();
  if (configured[name] === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Knowledge bundle "${name}" is not configured`,
    });
  }
  yield* ws.updateKnowledgeEntry(name, (entry) => ({ ...entry, enabled }));
  const manager = yield* KnowledgeManager;
  yield* manager.refreshCatalog();
  const renderer = yield* CliRenderer;
  yield* renderer.success(`${enabled ? "Enabled" : "Disabled"} knowledge bundle ${name}`);
});

const scopeConfig = {
  scope: scopeFlag.pipe(Flag.withDescription("Use project (default) or user knowledge state")),
} as const;

const listCommand = Command.make("list", scopeConfig, ({ scope }) =>
  handleKnowledgeList().pipe(
    withWorkspace({ scope, allowUninitialized: true }),
    withRuntime("knowledge list"),
  ),
).pipe(
  withArgvTracking(scopeConfig),
  Command.withAlias("ls"),
  Command.withDescription("List installed knowledge bundles"),
  Command.withExamples([
    { command: "axm knowledge list", description: "List installed knowledge bundles" },
  ]),
);

const searchConfig = {
  query: Argument.string("query").pipe(
    Argument.withDescription("Text to find across installed concepts"),
  ),
  ...scopeConfig,
} as const;

const searchCommand = Command.make("search", searchConfig, ({ query, scope }) =>
  handleKnowledgeSearch(query).pipe(withWorkspace(scope), withRuntime("knowledge search")),
).pipe(
  withArgvTracking(searchConfig),
  Command.withDescription("Search installed knowledge concepts"),
  Command.withExamples([
    {
      command: 'axm knowledge search "authentication"',
      description: "Search concept metadata and content",
    },
  ]),
);

const openConfig = {
  bundle: Argument.string("bundle").pipe(
    Argument.withDescription("Installed knowledge bundle name"),
  ),
  concept: Argument.string("concept").pipe(
    Argument.withDescription("Concept ID (path without .md)"),
  ),
  ...scopeConfig,
} as const;

const openCommand = Command.make("open", openConfig, ({ bundle, concept, scope }) =>
  handleKnowledgeOpen(bundle, concept).pipe(withWorkspace(scope), withRuntime("knowledge open")),
).pipe(
  withArgvTracking(openConfig),
  Command.withDescription("Open one installed knowledge concept"),
  Command.withExamples([
    {
      command: "axm knowledge open platform auth/session-management",
      description: "Read one concept by bundle and concept ID",
    },
  ]),
);

const lintConfig = {
  bundle: Argument.string("bundle").pipe(
    Argument.withDescription("Optional installed bundle name"),
    Argument.optional,
  ),
  ...scopeConfig,
} as const;

const lintCommand = Command.make("lint", lintConfig, ({ bundle, scope }) =>
  handleKnowledgeLint(Option.getOrUndefined(bundle)).pipe(
    withWorkspace(scope),
    withRuntime("knowledge lint"),
  ),
).pipe(
  withArgvTracking(lintConfig),
  Command.withDescription("Validate installed Open Knowledge Format bundles"),
  Command.withExamples([
    { command: "axm knowledge lint", description: "Validate all installed knowledge bundles" },
    {
      command: "axm knowledge lint platform",
      description: "Validate one installed knowledge bundle",
    },
  ]),
);

const activationConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Configured knowledge bundle name")),
  ...scopeConfig,
} as const;

const enableCommand = Command.make("enable", activationConfig, ({ name, scope }) =>
  setKnowledgeEnabled(name, true).pipe(
    Effect.provide(KnowledgeManagerLive),
    withWorkspace(scope),
    withRuntime("knowledge enable"),
  ),
).pipe(
  withArgvTracking(activationConfig),
  Command.withDescription("Include a knowledge bundle in discovery"),
  Command.withExamples([
    {
      command: "axm knowledge enable platform",
      description: "Restore a bundle to discovery and search",
    },
  ]),
);

const disableCommand = Command.make("disable", activationConfig, ({ name, scope }) =>
  setKnowledgeEnabled(name, false).pipe(
    Effect.provide(KnowledgeManagerLive),
    withWorkspace(scope),
    withRuntime("knowledge disable"),
  ),
).pipe(
  withArgvTracking(activationConfig),
  Command.withDescription("Exclude a knowledge bundle from discovery while keeping it installed"),
  Command.withExamples([
    {
      command: "axm knowledge disable platform",
      description: "Keep a bundle installed but exclude it from discovery",
    },
  ]),
);

export const knowledgeCommand = Command.make("knowledge").pipe(
  Command.withDescription("Browse and validate Open Knowledge Format bundles"),
  Command.withExamples([
    { command: "axm knowledge list", description: "List installed knowledge bundles" },
    {
      command: 'axm knowledge search "authentication"',
      description: "Search installed knowledge concepts",
    },
  ]),
  Command.withSubcommands([
    newCommand,
    listCommand,
    searchCommand,
    openCommand,
    lintCommand,
    enableCommand,
    disableCommand,
  ]),
);
