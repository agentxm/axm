import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type {
  PublishResult,
  PublishResultItem,
  PublishSelectionDecision,
} from "@agentxm/workspace/publishing";
import type { VerbosityLevel } from "../../cli-flags/index.js";
import { verdictDoc } from "../../operation-view.js";
import {
  ALREADY_PUBLISHED,
  NOT_TRIED,
  bytes,
  count,
  factParts,
  publishDisposition,
  publishOutcome,
  publishParticipation,
  publishPhase,
  publishReason,
  publishSourceDifferences,
  publishSourceState,
  publishVisibilityOrigin,
  suggestionsDoc,
  ABSENT,
  PROSE_SEPARATOR,
  VERBOSE_DETAILS_HINT,
  VERBOSE_LIST_HINT,
  joined,
  ledgerViewPolicy,
  resultLedgerColumns,
  type Doc,
  type DocNode,
  type LedgerColumn,
  type LedgerRow,
  type Mark,
} from "../../screen/index.js";
import {
  distinct,
  publishIdentity as identity,
  publishStandingOf as standingOf,
  type PlacedPublication as Placed,
  type PublicationSetItem as SetItem,
  type PublishStanding as Standing,
} from "./standing.js";
import { publishVerdictOf as verdictOf } from "./verdict.js";

/**
 * Separates the parts of one cell or aside. The painter owns the separator
 * glyph, so a cell that carries several facts joins them as prose.
 */
const DETAIL_HINT = VERBOSE_DETAILS_HINT;
const FOLD_HINT = VERBOSE_LIST_HINT;

const markOf = (standing: Standing): Mark => {
  switch (standing) {
    case "to-publish":
    case "published":
      return "create";
    case "already-published":
    case "skipped":
      return "unchanged";
    case "failed":
      return "failed";
    case "unconfirmed":
      return "warn";
    case "blocked":
      return "blocked";
    case "not-tried":
      return "not-tried";
  }
};

const wordOf = (standing: Standing, mode: PublishResult["mode"]): string => {
  switch (standing) {
    case "to-publish":
      return publishParticipation("publish");
    case "published":
      return publishOutcome("published");
    case "already-published":
      return mode === "preview" ? publishParticipation("verified-existing") : ALREADY_PUBLISHED;
    case "failed":
      return publishOutcome("failed");
    case "unconfirmed":
      return publishOutcome("unconfirmed");
    case "blocked":
      return publishOutcome("blocked");
    case "not-tried":
      return NOT_TRIED;
    case "skipped":
      return publishOutcome("skipped");
  }
};

const archiveSummary = (item: PublishResultItem): string | undefined =>
  item.archive === undefined
    ? undefined
    : joined([count(item.archive.includedCount, "file"), bytes(item.archive.zipBytes)]);

/** Dependencies published in the same run, which this extension waits for. */
const waitsFor = (item: PublishResultItem, setItem: SetItem | undefined): string | undefined => {
  const inSet = setItem?.dependencyIds.length ?? 0;
  if (inSet === 0) return undefined;
  return item.type === "pack"
    ? `after its ${count(inSet, "member")}`
    : `after ${count(inSet, "dependency", "dependencies")}`;
};

/** How many attempts a failed request made, which verbose output states. */
const attemptsNote = (item: PublishResultItem): string | undefined => {
  const cause = item.cause;
  if (cause === undefined) return undefined;
  if (!cause.retryable) return "not retryable";
  return cause.attemptCount === undefined || cause.maxAttempts === undefined
    ? "attempts exhausted"
    : `attempts exhausted at ${String(cause.attemptCount)} of ${String(cause.maxAttempts)}`;
};

/**
 * The detail column: what a reader needs beyond the name, the version, and the
 * plan or status. A row that did not go as planned says why here.
 */
const detailOf = (
  item: PublishResultItem,
  standing: Standing,
  mode: PublishResult["mode"],
  setItem: SetItem | undefined,
): string => {
  switch (standing) {
    case "to-publish":
      // A pack is small; what a reader needs is that it waits for its members.
      return waitsFor(item, setItem) ?? archiveSummary(item) ?? "";
    case "published":
    case "not-tried":
      return item.reason === "blocked_by_dependency" ? publishReason(item.reason) : "";
    case "already-published":
      return mode === "preview" ? ALREADY_PUBLISHED : "";
    case "blocked":
      return item.reason === "source_state_not_accepted" && item.sourceState !== undefined
        ? publishSourceDifferences(item.sourceState.differenceCount)
        : publishReason(item.reason);
    case "failed":
      // The cell stays short enough to wrap beside its row; the message and the
      // attempts behind it are the row's verbose evidence.
      return joined([
        publishReason(item.reason),
        item.cause?.retryable === true ? "retryable" : undefined,
      ]);
    case "unconfirmed":
    case "skipped":
      return publishReason(item.reason);
  }
};

const dim = (text: string): DocNode => ({ _tag: "paragraph", tone: "dim", text });

/**
 * The evidence behind one row, shown at verbose level: how it settled, where
 * its visibility came from, how its source compares with Git HEAD, what its
 * archive holds, and where it falls in dependency order.
 */
const evidenceOf = (
  item: PublishResultItem,
  standing: Standing,
  setItem: SetItem | undefined,
): Doc => {
  const source = item.sourceState;
  const archive = item.archive;
  return [
    ...(standing === "to-publish" || standing === "published" || standing === "already-published"
      ? []
      : [
          dim(
            joined([
              `${wordOf(standing, "apply")} during ${publishPhase(item.phase)}`,
              attemptsNote(item),
            ]),
          ),
        ]),
    ...(item.cause?.requestId === undefined ? [] : [dim(`request ${item.cause.requestId}`)]),
    ...(item.settlement === undefined || item.settlement === "response"
      ? []
      : [dim(`settled by ${item.settlement}`)]),
    ...(item.visibility === undefined
      ? []
      : [
          dim(
            `visibility ${item.visibility.value} ${publishVisibilityOrigin(item.visibility.disposition, item.visibility.source)}`,
          ),
        ]),
    ...(source === undefined
      ? []
      : [
          dim(
            `source ${publishSourceState(source.status, source.revision)} at ${source.directory}`,
          ),
          ...source.differences.map(({ path, change }) => dim(`${change} ${path}`)),
          ...(source.truncated
            ? [dim(`${count(source.differenceCount - source.differences.length, "more path")}`)]
            : []),
        ]),
    ...(archive === undefined
      ? []
      : [
          dim(
            `archive ${joined([
              `${String(archive.includedCount)} included`,
              `${String(archive.excludedCount)} excluded`,
              `${bytes(archive.uncompressedBytes)} source`,
              `${bytes(archive.zipBytes)} ZIP`,
            ])}`,
          ),
          ...archive.included.map((file) => dim(`include ${file.path} (${bytes(file.size)})`)),
          ...archive.excluded.map((file) =>
            dim(
              `exclude ${file.path} (${bytes(file.size)}), ${file.matchedPatterns.join(PROSE_SEPARATOR)}`,
            ),
          ),
        ]),
    ...(setItem === undefined
      ? []
      : [
          dim(
            joined([
              `dependency order ${String(setItem.dependencyOrder)}`,
              setItem.dependencyIds.length === 0
                ? undefined
                : `after ${setItem.dependencyIds.join(PROSE_SEPARATOR)}`,
            ]),
          ),
        ]),
  ];
};

const ledgerColumns = (mode: PublishResult["mode"]): ReadonlyArray<LedgerColumn> =>
  resultLedgerColumns("Extension", mode === "preview" ? "Plan" : "Status");

/** Rows whose reason and safe correlation facts remain actionable even in quiet output. */
const UNSETTLED: ReadonlySet<Standing> = new Set(["failed", "unconfirmed", "blocked", "not-tried"]);

const placedRow = (placed: Placed, mode: PublishResult["mode"], detailed: boolean): LedgerRow => {
  const message = placed.item.message;
  // Why an extension failed is what a reader acts on, so it takes the row's
  // own reason slot, which every ledger paints beneath its row at every width.
  const reason = message === undefined || !UNSETTLED.has(placed.standing) ? undefined : message;
  const children: Doc = detailed
    ? evidenceOf(placed.item, placed.standing, placed.setItem)
    : UNSETTLED.has(placed.standing) && placed.item.cause?.requestId !== undefined
      ? [dim(`request ${placed.item.cause.requestId}`)]
      : [];
  return {
    id: identity(placed.item),
    mark: markOf(placed.standing),
    cells: [
      identity(placed.item),
      placed.item.version ?? ABSENT,
      wordOf(placed.standing, mode),
      detailOf(placed.item, placed.standing, mode, placed.setItem),
    ],
    ...(reason === undefined ? {} : { reason }),
    ...(children.length === 0 ? {} : { children }),
  };
};

/**
 * A selection decision that left an extension out of the run. It never
 * reached the registry, so it has no version and nothing to tally; it is a row
 * only so verbose output accounts for every extension the selection saw.
 */
const decisionRow = (decision: PublishSelectionDecision): LedgerRow => ({
  id: decision.id,
  mark: "unchanged",
  cells: [
    decision.id,
    ABSENT,
    publishOutcome("skipped"),
    joined([
      publishDisposition(decision.disposition),
      decision.referencedBy.length === 0
        ? undefined
        : `referenced by ${decision.referencedBy.join(PROSE_SEPARATOR)}`,
    ]),
  ],
});

/**
 * The ledger: every extension the run took up, in dependency order, with the
 * extensions the selection left out folded into one line until `--verbose`
 * lists them.
 */
const publishLedger = (
  placed: ReadonlyArray<Placed>,
  omitted: ReadonlyArray<PublishSelectionDecision>,
  mode: PublishResult["mode"],
  detailed: boolean,
): Doc => {
  const taken = placed.filter((entry) => entry.standing !== "skipped");
  const skipped = placed.filter((entry) => entry.standing === "skipped");
  const left = skipped.length + omitted.length;
  const rows = [
    ...taken.map((entry) => placedRow(entry, mode, detailed)),
    ...(detailed
      ? [...skipped.map((entry) => placedRow(entry, mode, detailed)), ...omitted.map(decisionRow)]
      : []),
  ];
  if (rows.length === 0) return [];
  return [
    {
      _tag: "ledger",
      columns: ledgerColumns(mode),
      rows,
      ...(detailed || left === 0
        ? {}
        : {
            folds: [
              {
                mark: "unchanged",
                count: left,
                noun: `${left === 1 ? "extension" : "extensions"} not selected`,
                hint: FOLD_HINT,
              },
            ],
          }),
    },
  ];
};

/**
 * The facts a preview states once for the whole publication rather than on
 * every row: which visibility each new extension gets and where that came
 * from, and how the source compares with Git HEAD.
 */
const planFields = (placed: ReadonlyArray<Placed>): Doc => {
  const uploading = placed.filter((entry) => entry.standing === "to-publish");
  const visibility = distinct(
    uploading.flatMap(({ item }) =>
      item.visibility === undefined
        ? []
        : [
            `${item.visibility.value} (${publishVisibilityOrigin(item.visibility.disposition, item.visibility.source)})`,
          ],
    ),
  );
  const sources = uploading.flatMap(({ item }) =>
    item.sourceState === undefined ? [] : [item.sourceState],
  );
  const sourcePhrases = distinct(
    sources.map((source) => publishSourceState(source.status, source.revision)),
  );
  const [onlySource] = sourcePhrases;
  const source =
    sourcePhrases.length === 0
      ? undefined
      : sourcePhrases.length === 1 && onlySource !== undefined
        ? onlySource
        : joined(
            (["matches-head", "differs-from-head", "no-head"] as const).map((status) => {
              const matching = sources.filter((candidate) => candidate.status === status).length;
              return matching === 0
                ? undefined
                : `${String(matching)} ${publishSourceState(status, undefined)}`;
            }),
          );
  const fields = [
    ...(visibility.length === 0
      ? []
      : [{ label: "Visibility", value: visibility.join(PROSE_SEPARATOR) }]),
    ...(source === undefined ? [] : [{ label: "Source", value: source }]),
  ];
  return fields.length === 0 ? [] : [{ _tag: "fields", fields }];
};

/**
 * Conditions that deserve attention but did not stop the run: unmet
 * preconditions, advisory findings, and archive warnings, each stated once
 * with the extensions it concerns.
 */
const attentionDoc = (result: PublishResult): Doc => {
  const warnings = new Map<string, Array<string>>();
  const note = (message: string, subject: string | undefined) => {
    const subjects = warnings.get(message) ?? [];
    if (subject !== undefined && !subjects.includes(subject)) subjects.push(subject);
    warnings.set(message, subjects);
  };
  for (const item of result.execution.outcomes) {
    for (const finding of item.findings ?? []) {
      note(
        finding.ruleId === "publish/required-pack-version-unreachable"
          ? `Required pack compatibility review: ${finding.message}`
          : finding.message,
        identity(item),
      );
    }
    for (const warning of item.archive?.warnings ?? []) note(warning, identity(item));
  }
  for (const finding of result.publicationSet.findings) {
    if (finding.severity === "warning") note(finding.message, finding.targetId);
  }
  return [
    ...(result.execution.preconditions ?? []).flatMap((precondition): Doc =>
      precondition.status === "met"
        ? []
        : [
            {
              _tag: "callout",
              tone: "warn",
              title: precondition.label,
              children: [dim(precondition.detail ?? "Required before apply")],
            },
          ],
    ),
    ...[...warnings].map(([message, subjects]): DocNode => ({
      _tag: "callout",
      tone: "warn",
      title: message,
      ...(subjects.length === 0 ? {} : { children: [dim(subjects.join(PROSE_SEPARATOR))] }),
    })),
    ...result.publicationSet.findings.flatMap((finding): Doc =>
      finding.severity === "error"
        ? [{ _tag: "callout", tone: "error", title: finding.message }]
        : [],
    ),
  ];
};

/**
 * The copyable registry page for each extension the run published that no
 * other published extension contains, so a pack names itself rather than
 * every member it brought along.
 */
const publishedLinks = (placed: ReadonlyArray<Placed>): Doc => {
  const published = placed.filter((entry) => entry.standing === "published");
  const contained = new Set(published.flatMap((entry) => entry.setItem?.dependencyIds ?? []));
  return published.flatMap(({ item }): Doc =>
    item.links === undefined || contained.has(item.id)
      ? []
      : [
          {
            _tag: "paragraph",
            text: [{ text: item.links.html, link: item.links.html, copyable: true }],
          },
        ],
  );
};

const ownersOf = (result: PublishResult): ReadonlyArray<string> =>
  distinct([...result.selection.owners, ...result.execution.outcomes.map((item) => item.owner)]);

/** The title line: what the command is doing, as whom, and to which registry. */
const titleDoc = (result: PublishResult): Doc => {
  const owners = ownersOf(result);
  const aside = factParts([
    owners.length === 0 ? undefined : `as ${owners.join(PROSE_SEPARATOR)}`,
    `to ${result.selection.registry}`,
  ]);
  return [
    {
      _tag: "headline",
      tone: "neutral",
      text: [{ text: result.mode === "preview" ? "Previewing publish" : "Publishing", bold: true }],
      aside,
    },
  ];
};

export interface PublishDocOptions {
  readonly verbosity: VerbosityLevel;
  /** The exit code the invocation ends with, which a problem verdict states. */
  readonly exitCode: number;
  readonly suggestions: ReadonlyArray<SuggestedAction>;
  readonly withoutSuggestions?: boolean;
  /** How long an apply took, which a settled publication states. */
  readonly elapsedMs?: number;
}

/**
 * The publish result as one record: a title line, one ledger of the
 * extensions the run took up, the facts a preview states once, the conditions
 * that deserve attention, and a verdict. A preview's ledger is the plan; an
 * apply's is what happened. The evidence behind each row is its children, shown
 * at verbose level.
 */
export const publishDoc = (result: PublishResult, options: PublishDocOptions): Doc => {
  const { detailed, quiet } = ledgerViewPolicy(options.verbosity);
  const setItems = new Map(result.publicationSet.items.map((item) => [item.id, item] as const));
  const placed: ReadonlyArray<Placed> = result.execution.outcomes
    .map((item, index) => ({ item, index, setItem: setItems.get(item.id) }))
    .sort(
      (left, right) =>
        (left.setItem?.dependencyOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.setItem?.dependencyOrder ?? Number.MAX_SAFE_INTEGER) || left.index - right.index,
    )
    .map(({ item, setItem }) => ({ item, standing: standingOf(item, result.mode), setItem }));
  const taken = new Set(result.execution.outcomes.map((item) => item.id));
  const omitted = result.selection.decisions.filter(
    (decision) => decision.disposition !== "included" && !taken.has(decision.id),
  );
  const links = new Set(
    result.execution.outcomes.flatMap((item) =>
      item.links === undefined ? [] : [item.links.html],
    ),
  );
  // Each published page is already a copyable line under the verdict.
  const next = suggestionsDoc(
    options.suggestions.filter(
      (suggestion) => suggestion.url === undefined || !links.has(suggestion.url),
    ),
    options.withoutSuggestions === undefined
      ? undefined
      : { withoutSuggestions: options.withoutSuggestions },
  );

  const verdict = verdictOf(result, placed, options);
  const ledger =
    verdict.alone === true && !detailed
      ? []
      : publishLedger(placed, omitted, result.mode, detailed);
  const preview = result.mode === "preview";
  const settled = [
    ...verdictDoc({
      ledger: ledger.length > 0,
      tone: verdict.tone,
      verdict: verdict.verdict,
      aside: verdict.aside,
      ...(verdict.reason === undefined ? {} : { reason: verdict.reason }),
      ...(verdict.blocked === undefined ? {} : { blocked: verdict.blocked }),
    }),
    ...publishedLinks(placed),
  ];
  if (quiet) {
    const noChange =
      placed.length > 0 && placed.every((entry) => entry.standing === "already-published");
    const unresolved = placed.filter((entry) => UNSETTLED.has(entry.standing));
    const needsAttention = unresolved.length > 0 || result.execution.failure !== undefined;
    return noChange && !needsAttention
      ? []
      : [
          ...unresolved.map((entry): DocNode => ({
            _tag: "callout",
            tone: entry.standing === "failed" ? "error" : "warn",
            title: [
              { text: identity(entry.item), copyable: true },
              { text: `: ${wordOf(entry.standing, result.mode)}` },
            ],
            children: [
              {
                _tag: "paragraph",
                text:
                  entry.item.message ??
                  entry.item.cause?.message ??
                  detailOf(entry.item, entry.standing, result.mode, entry.setItem),
              },
              ...(entry.item.cause?.requestId === undefined
                ? []
                : [dim(`request ${entry.item.cause.requestId}`)]),
            ],
          })),
          ...(needsAttention ? attentionDoc(result) : []),
          ...settled,
          ...(needsAttention ? next : []),
        ];
  }
  return [
    ...(ledger.length === 0 ? [] : titleDoc(result)),
    ...ledger,
    ...(preview && ledger.length > 0 ? planFields(placed) : []),
    ...attentionDoc(result),
    ...settled,
    ...(preview && !detailed && ledger.length > 0 && omitted.length === 0
      ? [dim(DETAIL_HINT)]
      : []),
    ...next,
  ];
};
