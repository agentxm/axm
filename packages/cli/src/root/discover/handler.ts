import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { RegistryUrl } from "@agentxm/client-core/unstable/auth";
import { CliRenderer, type TableView } from "@agentxm/client-core/unstable/cli-renderer";
import {
  discover,
  type DiscoverPackageResult,
  type DiscoverResult,
} from "@agentxm/client-core/unstable/discover";
import { PackageUrlSchema } from "@agentxm/client-core/unstable/packaging";
import { createRegistryClient } from "@agentxm/client-core/unstable/registry";

const encodePurl = Schema.encodeSync(PackageUrlSchema);

export interface DiscoverHandlerArgs {
  readonly path: Option.Option<string>;
}

const DiscoverExtensionSchema = Schema.Struct({
  ref: Schema.String,
  resolved: Schema.Boolean,
  owner: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  installVersion: Schema.optional(Schema.String),
  attestedBy: Schema.Array(Schema.String),
  official: Schema.Boolean,
  packageVersionInRange: Schema.Boolean,
});

const DiscoverPackageItemSchema = Schema.Struct({
  package: Schema.String,
  extensions: Schema.Array(DiscoverExtensionSchema),
});

const DiscoverOutputFields = {
  items: Schema.Array(DiscoverPackageItemSchema),
  count: Schema.Number,
  totalDetected: Schema.Number,
  registryAvailable: Schema.Boolean,
} satisfies Schema.Struct.Fields;

export const DiscoverOutputSchema = Schema.Struct(DiscoverOutputFields);
export type DiscoverOutput = typeof DiscoverOutputSchema.Type;

interface DiscoverTableRow {
  readonly package: string;
  readonly extension: string;
  readonly attestedBy: string;
  readonly official: string;
  readonly installVersion: string;
}

const DiscoverTable = {
  columns: {
    package: { header: "Package" },
    extension: { header: "Extension" },
    attestedBy: { header: "Attested" },
    official: { header: "Official" },
    installVersion: { header: "Install" },
  },
} as const satisfies TableView<DiscoverTableRow>;

const defaultRunDiscover = (projectDir: string) =>
  Effect.gen(function* () {
    const registryUrl = yield* RegistryUrl;
    const registryClient = yield* createRegistryClient(registryUrl);
    return yield* discover(projectDir, registryClient);
  });

export const resolveDiscoverProjectDir = (path: Option.Option<string>): string =>
  Option.getOrElse(path, () => process.cwd());

export const formatPackageName = (pkg: DiscoverPackageResult): string => {
  const parts = pkg.detectedPackage;
  if (parts.namespace !== undefined) {
    return parts.version !== undefined
      ? `${parts.namespace}/${parts.name}@${parts.version}`
      : `${parts.namespace}/${parts.name}`;
  }
  return parts.version !== undefined ? `${parts.name}@${parts.version}` : parts.name;
};

export const toDiscoverOutput = (
  result: DiscoverResult,
): Schema.Struct.Type<typeof DiscoverOutputFields> => ({
  items: result.packages.map((pkg) => ({
    package: encodePurl(pkg.detectedPackage),
    extensions: pkg.extensions.map((entry) => ({
      ref: entry.ref,
      resolved: entry.resolved,
      owner: entry.extension?.owner,
      type: entry.extension?.type,
      name: entry.extension?.name,
      installVersion: entry.extension?.installVersion,
      attestedBy: [...entry.attestedBy],
      official: entry.official,
      packageVersionInRange: entry.packageVersionInRange,
    })),
  })),
  count: result.packages.length,
  totalDetected: result.totalDetected,
  registryAvailable: result.registryAvailable,
});

const toDiscoverTableRows = (result: DiscoverResult): ReadonlyArray<DiscoverTableRow> =>
  result.packages.flatMap((pkg) =>
    pkg.extensions.map((entry) => ({
      package: formatPackageName(pkg),
      extension: entry.ref,
      attestedBy: entry.attestedBy.join("+"),
      official: entry.official ? "yes" : "no",
      installVersion: entry.extension?.installVersion ?? "-",
    })),
  );

const formatSummary = (
  args: { readonly count: number; readonly totalDetected: number },
  extensionCount: number,
): string => {
  const extensionLabel = extensionCount === 1 ? "extension" : "extensions";
  const packageLabel = args.totalDetected === 1 ? "package" : "packages";
  return `Found ${extensionCount} companion ${extensionLabel} for ${args.count} of ${args.totalDetected} detected ${packageLabel}.`;
};

export const handleDiscoverWith = <E, R>(
  args: DiscoverHandlerArgs,
  runDiscover: (projectDir: string) => Effect.Effect<DiscoverResult, E, R>,
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const projectDir = resolveDiscoverProjectDir(args.path);
    const result = yield* runDiscover(projectDir);
    const output = toDiscoverOutput(result);

    if (yield* renderer.result(output, DiscoverOutputSchema)) {
      return;
    }

    if (!result.registryAvailable) {
      yield* renderer.warn("Registry unavailable. Showing local recommendations only.");
    }

    if (output.items.length === 0) {
      yield* renderer.info("No companion extensions found.");
      return;
    }

    const rows = toDiscoverTableRows(result);
    yield* renderer.table(rows, DiscoverTable, "Companion extensions");
    yield* renderer.success(formatSummary(output, rows.length));
  });

export const handleDiscover = (args: DiscoverHandlerArgs) =>
  handleDiscoverWith(args, defaultRunDiscover);
