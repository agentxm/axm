import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { RegistryUrl } from "@agentxm/registry-client";
import { Screen, inventoryDoc, type ViewColumn } from "../../screen/index.js";
import {
  discover,
  type DiscoverPackageResult,
  type DiscoverResult,
} from "@agentxm/extension-discovery";
import { PackageUrlSchema } from "@agentxm/extension-model/unstable/packaging";
import { createRegistryClient } from "@agentxm/registry-client";
import {
  ExecutionDirectory,
  resolveExecutionPath,
  type ExecutionDirectoryService,
} from "../../execution-directory.js";

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

const DiscoverColumns = [
  { header: "Package", value: (row: DiscoverTableRow) => row.package },
  { header: "Extension", value: (row: DiscoverTableRow) => row.extension },
  { header: "Attested", value: (row: DiscoverTableRow) => row.attestedBy },
  { header: "Official", value: (row: DiscoverTableRow) => row.official },
  { header: "Install", value: (row: DiscoverTableRow) => row.installVersion },
] satisfies ReadonlyArray<ViewColumn<DiscoverTableRow>>;

const defaultRunDiscover = (projectDir: string) =>
  Effect.gen(function* () {
    const registryUrl = yield* RegistryUrl;
    const registryClient = yield* createRegistryClient(registryUrl);
    return yield* discover(projectDir, registryClient);
  });

export const resolveDiscoverProjectDir = (
  selected: Option.Option<string>,
  executionDirectory: ExecutionDirectoryService,
  path: Pick<Path.Path, "resolve">,
): string =>
  Option.match(selected, {
    onNone: () => executionDirectory.path,
    onSome: (value) => resolveExecutionPath(path, executionDirectory, value),
  });

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

const registryUnavailableMessage = "Registry unavailable. Showing local recommendations only.";

const formatDiscoverSummary = (
  result: DiscoverResult,
  output: Schema.Struct.Type<typeof DiscoverOutputFields>,
  rowCount: number,
): string =>
  result.registryAvailable
    ? formatSummary(output, rowCount)
    : `${registryUnavailableMessage} ${formatSummary(output, rowCount)}`;

const formatEmptyMessage = (result: DiscoverResult): string =>
  result.registryAvailable
    ? "No companion extensions found."
    : `${registryUnavailableMessage} No companion extensions found.`;

export const handleDiscoverWith = <E, R>(
  args: DiscoverHandlerArgs,
  runDiscover: (projectDir: string) => Effect.Effect<DiscoverResult, E, R>,
) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const executionDirectory = yield* ExecutionDirectory;
    const path = yield* Path.Path;
    const projectDir = resolveDiscoverProjectDir(args.path, executionDirectory, path);
    const result = yield* screen.task(
      "Scanning project dependencies",
      () => runDiscover(projectDir),
      { successMessage: "Scanned project dependencies" },
    );
    const output = toDiscoverOutput(result);

    if (yield* screen.document(output, DiscoverOutputSchema)) {
      return;
    }

    if (output.items.length === 0) {
      yield* screen.result(
        inventoryDoc({
          rows: [],
          columns: DiscoverColumns,
          summary: "",
          empty: formatEmptyMessage(result),
        }),
      );
      return;
    }

    const rows = toDiscoverTableRows(result);
    yield* screen.result(
      inventoryDoc({
        rows,
        columns: DiscoverColumns,
        summary: formatDiscoverSummary(result, output, rows.length),
        empty: formatEmptyMessage(result),
      }),
    );
  });

export const handleDiscover = (args: DiscoverHandlerArgs) =>
  handleDiscoverWith(args, defaultRunDiscover);
