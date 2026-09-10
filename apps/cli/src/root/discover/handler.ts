import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import {
  detectedPackageName,
  DiscoverExtensions,
  DiscoverOutputSchema,
  type DiscoverExtensionsResult,
} from "@agentxm/extension-discovery";
import { observeUnit } from "@agentxm/workspace-operations";

import { Screen, inventoryDoc, type ViewColumn } from "../../screen/index.js";
import { withLiveOperation } from "../shared/operation-lifecycle.js";
import {
  ExecutionDirectory,
  resolveExecutionPath,
  type ExecutionDirectoryService,
} from "../../execution-directory.js";

export interface DiscoverHandlerArgs {
  readonly path: Option.Option<string>;
}

interface DiscoverTableRow {
  readonly package: string;
  readonly extension: string;
  readonly attestedBy: string;
  readonly official: string;
  readonly installVersion: string;
}

const DiscoverColumns = [
  { header: "Package", priority: "required", value: (row: DiscoverTableRow) => row.package },
  { header: "Extension", value: (row: DiscoverTableRow) => row.extension },
  { header: "Attested", priority: "optional", value: (row: DiscoverTableRow) => row.attestedBy },
  { header: "Official", priority: "optional", value: (row: DiscoverTableRow) => row.official },
  { header: "Install", value: (row: DiscoverTableRow) => row.installVersion },
] satisfies ReadonlyArray<ViewColumn<DiscoverTableRow>>;

export const resolveDiscoverProjectDir = (
  selected: Option.Option<string>,
  executionDirectory: ExecutionDirectoryService,
  path: Pick<Path.Path, "resolve">,
): string =>
  Option.match(selected, {
    onNone: () => executionDirectory.path,
    onSome: (value) => resolveExecutionPath(path, executionDirectory, value),
  });

const toDiscoverTableRows = (result: DiscoverExtensionsResult): ReadonlyArray<DiscoverTableRow> =>
  result.packages.flatMap((pkg) =>
    pkg.extensions.map((entry) => ({
      package: detectedPackageName(pkg),
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

const formatDiscoverSummary = (result: DiscoverExtensionsResult, rowCount: number): string =>
  result.registryAvailable
    ? formatSummary(result.document, rowCount)
    : `${registryUnavailableMessage} ${formatSummary(result.document, rowCount)}`;

const formatEmptyMessage = (result: DiscoverExtensionsResult): string =>
  result.registryAvailable
    ? "No companion extensions found."
    : `${registryUnavailableMessage} No companion extensions found.`;

export const handleDiscover = Effect.fn("Discover.handle")(function* (args: DiscoverHandlerArgs) {
  const screen = yield* Screen;
  const executionDirectory = yield* ExecutionDirectory;
  const path = yield* Path.Path;
  const projectDir = resolveDiscoverProjectDir(args.path, executionDirectory, path);
  const result = yield* withLiveOperation(
    { command: "discover", name: "Discover companion extensions", mode: "preview" },
    observeUnit(
      { id: "dependencies", label: "project dependencies" },
      DiscoverExtensions.query({ projectDir }),
    ),
  );

  if (yield* screen.document(result.document, DiscoverOutputSchema)) {
    return;
  }

  if (result.document.items.length === 0) {
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
      summary: formatDiscoverSummary(result, rows.length),
      empty: formatEmptyMessage(result),
    }),
  );
});
