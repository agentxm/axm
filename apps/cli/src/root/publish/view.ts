import * as Effect from "effect/Effect";

import { formatFqn } from "@agentxm/extension-model/unstable/extensions";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type {
  PublishPublicationSet,
  PublishResult,
  PublishResultItem,
  PublishSelectionDecision,
} from "@agentxm/workspace/publishing";
import { Verbosity, type VerbosityLevel } from "../../cli-flags/index.js";
import { verdictDoc } from "../../operation-view.js";
import type { Doc, DocNode, LedgerColumn, LedgerRow, Mark, Tone } from "../../screen/doc.js";
import {
  ALREADY_PUBLISHED,
  NOT_TRIED,
  Screen,
  blockingClass,
  bytes,
  count,
  duration,
  factParts,
  exitPhrase,
  interruptionPhrase,
  publishDisposition,
  publishOutcome,
  publishParticipation,
  publishPhase,
  publishReason,
  publishSourceDifferences,
  publishSourceState,
  publishVisibilityOrigin,
  suggestionsDoc,
} from "../../screen/index.js";

/**
 * Separates the parts of one cell or aside. The painter owns the separator
 * glyph, so a cell that carries several facts joins them as prose.
 */
const SEPARATOR = ", ";

/** Stands in the version column for an extension with no resolved version. */
const NO_VERSION = "—";

/** Where no gate opens, the only place a reader learns the details are one flag away. */
const DETAIL_HINT = "--verbose for details";

const FOLD_HINT = "--verbose to list";

const joined = (parts: ReadonlyArray<string | undefined>): string =>
  parts
    .filter((part): part is string => part !== undefined && part.trim().length > 0)
    .join(SEPARATOR);

const identity = (item: Pick<PublishResultItem, "owner" | "type" | "name">): string =>
  formatFqn({ owner: item.owner, type: item.type, name: item.name });

const versioned = (item: PublishResultItem): string =>
  item.version === undefined ? identity(item) : `${identity(item)}@${item.version}`;

export const publishBrowserSuggestions = (result: PublishResult): ReadonlyArray<SuggestedAction> =>
  result.execution.outcomes.flatMap((item) =>
    item.links === undefined ? [] : [{ description: "View in browser", url: item.links.html }],
  );

type SetItem = PublishPublicationSet["items"][number];

/**
 * How one extension stands in the ledger. Everything a row says follows from
 * it, and so does the verdict's tally, so the two never disagree.
 */
type Standing =
  | "to-publish"
  | "published"
  | "already-published"
  | "failed"
  | "unconfirmed"
  | "blocked"
  | "not-tried"
  | "skipped";

/**
 * A blocked extension whose own condition stopped the run. Every other
 * blocked extension was stopped by something else before it was tried.
 */
const OWN_CONDITION: ReadonlySet<PublishResultItem["reason"]> = new Set([
  "source_state_not_accepted",
  "stale_material",
]);

const standingOf = (item: PublishResultItem, mode: PublishResult["mode"]): Standing => {
  switch (item.status) {
    case "success":
      return item.action === "publish" ? "published" : "already-published";
    case "failed":
      return "failed";
    case "unknown":
      return "unconfirmed";
    case "blocked":
      return OWN_CONDITION.has(item.reason) ? "blocked" : "not-tried";
    case "skipped":
      return "skipped";
    case "pending":
      // A preview leaves every candidate pending by construction; an apply
      // that ends with one pending never dispatched it.
      return mode === "preview" ? "to-publish" : "not-tried";
  }
};

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
              `exclude ${file.path} (${bytes(file.size)}), ${file.matchedPatterns.join(SEPARATOR)}`,
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
                : `after ${setItem.dependencyIds.join(SEPARATOR)}`,
            ]),
          ),
        ]),
  ];
};

interface Placed {
  readonly item: PublishResultItem;
  readonly standing: Standing;
  readonly setItem: SetItem | undefined;
}

const ledgerColumns = (mode: PublishResult["mode"]): ReadonlyArray<LedgerColumn> => [
  { header: "Extension", role: "name" },
  { header: "Version", role: "fixed", priority: "preferred" },
  { header: mode === "preview" ? "Plan" : "Status", role: "fixed", priority: "required" },
  { header: "Detail", role: "elastic", priority: "optional" },
];

/** Rows that did not settle, whose message a reader has to act on either way. */
const UNSETTLED: ReadonlySet<Standing> = new Set(["failed", "unconfirmed"]);

const placedRow = (placed: Placed, mode: PublishResult["mode"], detailed: boolean): LedgerRow => {
  const message = placed.item.message;
  const children: Doc = [
    // Why an extension failed is what a reader acts on, so it always shows,
    // beneath its row rather than in a cell too narrow to hold it.
    ...(message === undefined || !UNSETTLED.has(placed.standing)
      ? []
      : [{ _tag: "paragraph", tone: "warn", text: message } as const]),
    ...(detailed ? evidenceOf(placed.item, placed.standing, placed.setItem) : []),
  ];
  return {
    id: identity(placed.item),
    mark: markOf(placed.standing),
    cells: [
      identity(placed.item),
      placed.item.version ?? NO_VERSION,
      wordOf(placed.standing, mode),
      detailOf(placed.item, placed.standing, mode, placed.setItem),
    ],
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
    NO_VERSION,
    publishOutcome("skipped"),
    joined([
      publishDisposition(decision.disposition),
      decision.referencedBy.length === 0
        ? undefined
        : `referenced by ${decision.referencedBy.join(SEPARATOR)}`,
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

const distinct = (values: ReadonlyArray<string>): ReadonlyArray<string> => [...new Set(values)];

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
      : [{ label: "Visibility", value: visibility.join(SEPARATOR) }]),
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
      ...(subjects.length === 0 ? {} : { children: [dim(subjects.join(SEPARATOR))] }),
    })),
    ...result.publicationSet.findings.flatMap((finding): Doc =>
      finding.severity === "error"
        ? [{ _tag: "callout", tone: "error", title: finding.message }]
        : [],
    ),
  ];
};

/** The counts a problem verdict carries as its aside, in the order the rows read. */
const tally = (placed: ReadonlyArray<Placed>, exitCode: number): ReadonlyArray<string> => {
  const counted = (standing: Standing, word: string): string | undefined => {
    const value = placed.filter((entry) => entry.standing === standing).length;
    return value === 0 ? undefined : `${String(value)} ${word}`;
  };
  return [
    counted("published", publishOutcome("published")),
    counted("failed", publishOutcome("failed")),
    counted("unconfirmed", publishOutcome("unconfirmed")),
    counted("blocked", publishOutcome("blocked")),
    counted("not-tried", NOT_TRIED),
    counted("already-published", ALREADY_PUBLISHED),
    exitCode === 0 ? undefined : exitPhrase(exitCode),
  ].filter((part): part is string => part !== undefined);
};

/** The visibility a settled publication took, for its verdict's aside. */
const visibilitySummary = (published: ReadonlyArray<Placed>): string | undefined => {
  const values = published.flatMap(({ item }) =>
    item.visibility === undefined ? [] : [item.visibility.value],
  );
  const kinds = distinct(values);
  const [only] = kinds;
  if (kinds.length === 1) return only;
  return joined(
    kinds.map((kind) => `${String(values.filter((value) => value === kind).length)} ${kind}`),
  );
};

interface Verdict {
  readonly tone: Tone;
  readonly verdict: string;
  readonly aside: ReadonlyArray<string>;
  readonly reason?: string;
  readonly blocked?: true;
  /** Nothing changed, so the verdict stands alone without a ledger above it. */
  readonly alone?: true;
}

const alreadyPublishedVerdict = (existing: ReadonlyArray<Placed>): string => {
  const [only] = existing;
  return existing.length === 1 && only !== undefined
    ? `${versioned(only.item)} is already published and verified`
    : `All ${String(existing.length)} selected versions are already published and verified`;
};

const verdictOf = (
  result: PublishResult,
  placed: ReadonlyArray<Placed>,
  options: { readonly exitCode: number; readonly elapsedMs?: number },
): Verdict => {
  const inState = (standing: Standing) => placed.filter((entry) => entry.standing === standing);
  const toPublish = inState("to-publish");
  const published = inState("published");
  const existing = inState("already-published");
  const failed = inState("failed");
  const unconfirmed = inState("unconfirmed");
  const blocked = inState("blocked");
  const notTried = inState("not-tried");
  const skipped = inState("skipped");
  const problemAside = tally(placed, options.exitCode);

  if (result.interruption !== undefined) {
    return {
      tone: "error",
      verdict: interruptionPhrase(
        result.interruption.signal,
        published.length > 0 ? "retained" : unconfirmed.length > 0 ? "unknown" : "none",
      ),
      aside: problemAside,
    };
  }
  if (placed.length === 0) {
    return {
      tone: "ok",
      verdict: "No extensions selected for publishing",
      aside: [],
      alone: true,
    };
  }
  const failure = result.execution.failure;
  if (failure !== undefined) {
    const [ownCondition] = blocked;
    return ownCondition === undefined
      ? { tone: "error", verdict: "Publish failed", aside: problemAside, reason: failure.message }
      : {
          tone: "warn",
          verdict: `Publish is blocked — ${blockingClass(
            ownCondition.item.reason === "source_state_not_accepted"
              ? "override-required"
              : "stale-candidate",
          )}`,
          aside: problemAside,
          reason: failure.message,
          blocked: true,
        };
  }
  if (result.mode === "preview") {
    if (failed.length > 0) {
      return {
        tone: "error",
        verdict: `Publish preflight failed for ${count(failed.length, "extension")}`,
        aside: ["nothing was uploaded", ...problemAside],
      };
    }
    if (toPublish.length === 0 && existing.length > 0) {
      return { tone: "ok", verdict: alreadyPublishedVerdict(existing), aside: [], alone: true };
    }
    return {
      tone: "neutral",
      verdict: `Would publish ${count(toPublish.length, "extension")}`,
      aside: [
        existing.length === 0 ? undefined : `${String(existing.length)} ${ALREADY_PUBLISHED}`,
        "nothing was uploaded",
      ].filter((part): part is string => part !== undefined),
    };
  }
  const unfinished = failed.length + unconfirmed.length + blocked.length + notTried.length;
  if (published.length > 0 && unfinished === 0) {
    return {
      tone: "ok",
      verdict: `Published ${count(published.length, "extension")}`,
      aside: [
        visibilitySummary(published),
        options.elapsedMs === undefined ? undefined : duration(options.elapsedMs),
      ].filter((part): part is string => part !== undefined),
    };
  }
  if (published.length > 0) {
    return { tone: "warn", verdict: "Partially published", aside: problemAside };
  }
  if (failed.length > 0) {
    const label = failed.some((entry) => entry.item.phase === "upload_execution")
      ? "Publish failed"
      : "Publish preflight failed";
    return {
      tone: "error",
      verdict: `${label} for ${count(failed.length, "extension")}`,
      aside: problemAside,
    };
  }
  if (unconfirmed.length > 0) {
    return {
      tone: "error",
      verdict: `Publish did not confirm ${count(unconfirmed.length, "extension")}`,
      aside: problemAside,
      reason: "Verify the target registry before publishing again.",
    };
  }
  if (existing.length > 0) {
    return { tone: "ok", verdict: alreadyPublishedVerdict(existing), aside: [], alone: true };
  }
  return {
    tone: "ok",
    verdict: `No extensions published — ${count(skipped.length, "dependency", "dependencies")} left as registry references`,
    aside: [],
    alone: true,
  };
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
    owners.length === 0 ? undefined : `as ${owners.join(SEPARATOR)}`,
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
  const detailed = options.verbosity === "verbose" || options.verbosity === "debug";
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
  if (options.verbosity === "quiet") {
    const noChange =
      placed.length > 0 && placed.every((entry) => entry.standing === "already-published");
    return noChange ? [] : settled;
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

/**
 * Render the human publish result. Quiet keeps the verdict, a blocked reason,
 * and published links while dropping the title, ledger, narration, and next
 * actions.
 *
 * @returns whether the outcome was rendered
 */
export const renderHumanPublishResult = (
  screen: typeof Screen.Service,
  result: PublishResult,
  options: Omit<PublishDocOptions, "verbosity">,
) =>
  Effect.gen(function* () {
    const verbosity = yield* Verbosity;
    yield* screen.result(publishDoc(result, { ...options, verbosity: verbosity.level }));
    return true;
  });
