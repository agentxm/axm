/** One passive invocation joins selected local ownership and retention facts. */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { isLexicallyWithin } from "@agentxm/host-primitives";
import { ManifestIdentitySchema } from "@agentxm/extension-content";
import {
  manifestFilenameForType,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions/common";
import { installableExtensionTypes } from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  createNativeLocationTable,
  copiedDirectoryOwnsPath,
  nativeUnitKey,
  type OwnershipUnitAddress,
} from "@agentxm/workspace-kernel/locations";
import {
  inspectNativePackageReferences,
  inspectDesiredMcpServer,
} from "@agentxm/workspace-kernel/projection";
import {
  WorkspaceLocation,
  WorkspaceRecords,
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  SETTINGS_ENTRY_KEYS,
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
  desiredReachability,
  unresolvedPackRoutes,
  unresolvedPackRoutesText,
  desiredStateProblemText,
  lockEntryVersion,
  observeDesiredCanonical,
  bundledSkillCanonicalRoot,
  sameSourceIdentity,
  desiredIdentityFqn,
  type LockEntry,
} from "@agentxm/workspace-kernel/workspace-state";
import { buildInventoryDocument } from "../inventory-document.js";
import { inspectInventory } from "../inventory-inspection.js";
import { withLocalInspectionReadView, inspectionReadDiagnostics } from "./content-read-view.js";
import { filterShowAgentOutcomes, type ShowAgentOutcome } from "./agent-outcomes.js";
import {
  type InspectionIdentity,
  type InspectionItem,
  type InspectionRequestResult,
  type LocalInspectionDocument,
} from "./local-inspection-document.js";
import {
  acceptedInspectionSource,
  inspectionIdentity,
  inspectionSource,
  inspectionSelectionIssue,
  InvalidInspectionSelection,
  matchesInspectionIdentity,
  type InspectionCandidate,
  type LocalInspectionRequest,
} from "./local-inspection-selection.js";
import { inspectMcpPackageFacts } from "./mcp-facts.js";
import { inspectPackMembers } from "../packs/pack-members.js";

const complete = { state: "complete", reasons: [] } satisfies InspectionItem["desired"]["coverage"];
const notApplicable = {
  state: "not-applicable",
  reasons: [],
} satisfies InspectionItem["desired"]["coverage"];
const partial = (reason: string): InspectionItem["desired"]["coverage"] => ({
  state: "partial",
  reasons: [reason],
});

export const LocalInspection = {
  query: Effect.fn("LocalInspection.query")(function* (request: LocalInspectionRequest) {
    const selectionIssue = inspectionSelectionIssue(request.selection);
    if (selectionIssue !== undefined)
      return yield* new InvalidInspectionSelection({ detail: selectionIssue });
    const location = yield* WorkspaceLocation;
    const records = yield* WorkspaceRecords;
    const desired = yield* DesiredStateReader;
    const locks = yield* LockfileReader;
    const settings = yield* SettingsReader;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const layout = yield* Ref.get(location.layout);
    const graph = yield* desired.graph();
    const configuredAgents = yield* settings.configuredAgents;
    const registrySources = yield* settings.registrySourceHosts;
    const raw = yield* records.getInventory({ types: request.types ?? [] });
    const types = request.types?.length ? [...new Set(request.types)] : installableExtensionTypes;
    const candidates: Array<InspectionCandidate> = [];
    const acceptedPath = (type: InspectionCandidate["type"], entry: LockEntry) =>
      computeExtensionPathsForLayout(
        path.join,
        layout,
        extensionPathSourceFromLockEntry(entry),
        toExtensionTypePlural(type),
        entry.identity.name,
      ).canonicalPath;
    const addCandidate = (
      args: Omit<InspectionCandidate, "id" | "identity">,
      explicitIdentity?: InspectionIdentity,
    ) => {
      const identity = explicitIdentity ?? inspectionIdentity({ ...args, scope: location.scope });
      const sourceName =
        identity.source.authority === "registry" && identity.source.sourceName === undefined
          ? registrySources.find((source) => source.location.href === identity.source.endpoint)
              ?.name
          : undefined;
      const candidate = {
        ...args,
        id: `subject-${candidates.length + 1}`,
        identity: {
          ...identity,
          source: { ...identity.source, ...(sourceName === undefined ? {} : { sourceName }) },
        },
      };
      candidates.push(candidate);
    };
    for (const row of raw.items) {
      const node = graph.nodes.find((node) => node.type === row.type && node.name === row.name);
      const accepted = Option.getOrUndefined(yield* locks.acceptedEntry(row.type, row.name));
      const canonicalPath =
        layout.scope === "project" &&
        (node?.identity.authority === "workspace" || row.classification.lifecycle === "undeclared")
          ? path.join(layout.authoredRoot(row.type), row.name)
          : node?.identity.authority === "bundled"
            ? bundledSkillCanonicalRoot(path.join, layout, row.name)
            : accepted === undefined
              ? undefined
              : acceptedPath(row.type, accepted);
      addCandidate({
        type: row.type,
        name: row.name,
        row,
        ...(node === undefined ? {} : { node }),
        ...(accepted === undefined ? {} : { accepted }),
        ...(canonicalPath === undefined ? {} : { canonicalPath }),
        inInventory: true,
      });
    }
    for (const problem of graph.problems) {
      if (problem.type !== "projection-collision" || !types.includes(problem.extensionType))
        continue;
      const node = graph.nodes.find(
        (node) => node.type === problem.extensionType && node.name === problem.name,
      );
      if (node === undefined) continue;
      for (const identity of problem.identities) {
        if (sameSourceIdentity(node.identity, identity)) continue;
        // The graph keeps every competing authority; no first-match identity is invented.
        const fqn = Option.getOrUndefined(desiredIdentityFqn(identity));
        addCandidate(
          { type: node.type, name: node.name, competingClaim: true, inInventory: false },
          {
            type: node.type,
            name: node.name,
            scope: location.scope,
            ...(fqn === undefined ? {} : { fqn }),
            source: inspectionSource(identity),
          },
        );
      }
    }
    // Accepted-only records are selectable, but never enlarge --all's local inventory.
    for (const type of types) {
      const entries = yield* locks.entries(type);
      for (const entry of Object.values(entries)) {
        const root = acceptedPath(type, entry);
        const acceptedIdentity = inspectionIdentity({
          type,
          name: entry.identity.name,
          accepted: entry,
          scope: location.scope,
        });
        const competingIndex = candidates.findIndex(
          (candidate) =>
            candidate.competingClaim === true &&
            candidate.type === type &&
            candidate.identity.fqn === acceptedIdentity.fqn &&
            candidate.identity.source.authority === acceptedIdentity.source.authority &&
            candidate.identity.source.endpoint === acceptedIdentity.source.endpoint,
        );
        const competing = candidates[competingIndex];
        if (competing !== undefined) {
          // Accepted evidence enriches this exact source identity without borrowing
          // the representative's desired declaration or enlarging ordinary inventory.
          candidates[competingIndex] = { ...competing, accepted: entry, canonicalPath: root };
          continue;
        }
        if (
          candidates.some(
            (candidate) =>
              candidate.type === type &&
              candidate.canonicalPath === root &&
              candidate.identity.fqn === acceptedIdentity.fqn &&
              candidate.identity.source.authority === acceptedIdentity.source.authority &&
              candidate.identity.source.endpoint === acceptedIdentity.source.endpoint,
          )
        )
          continue;
        addCandidate({
          type,
          name: entry.identity.name,
          accepted: entry,
          canonicalPath: root,
          inInventory: false,
        });
      }
    }
    const selected = new Set<string>();
    const requests: Array<InspectionRequestResult> = [];
    const extraItems: Array<InspectionItem> = [];
    // Path resolution needs declarations and observed ownership units for the bounded universe.
    // Identity/all requests inspect only selected rows after exact identity resolution.
    const preinspection =
      request.selection.kind === "paths" ? yield* inspectInventory(raw) : undefined;
    const select = (
      kind: InspectionRequestResult["kind"],
      input: string,
      matches: ReadonlyArray<InspectionCandidate>,
      ambiguous = matches.length > 1,
      pathFacts?: InspectionRequestResult["path"],
    ) => {
      const id = `request-${requests.length + 1}`;
      const mismatched = matches.filter(
        (candidate) =>
          candidate.type === "pack" &&
          graph.problems.some(
            (problem) =>
              problem.type === "pack-identity-mismatch" && problem.pack === candidate.identity.fqn,
          ),
      );
      const identityMismatch = mismatched.length > 0;
      ambiguous ||= identityMismatch;
      const resolved = matches.length > 0 && !ambiguous;
      const result: InspectionRequestResult = {
        id,
        kind,
        input,
        resolution: ambiguous ? "conflict" : resolved ? "resolved" : "not-found",
        code: ambiguous ? 6 : resolved ? 0 : 3,
        subjectRefs: resolved
          ? matches.map((candidate) => candidate.id)
          : kind === "all"
            ? matches
                .filter((candidate) => !mismatched.includes(candidate))
                .map((candidate) => candidate.id)
            : [],
        candidateRefs: ambiguous
          ? (kind === "all" ? mismatched : matches).map((candidate) => candidate.id)
          : [],
        ...(resolved
          ? {}
          : {
              reason: identityMismatch
                ? "The observed Pack manifest has a different identity; inspection refuses to describe it as the requested Pack."
                : ambiguous
                  ? "Several local identities or ownership claims match; select an exact source identity or ownership address."
                  : "No subject is established in the selected scope and types.",
            }),
        ...(resolved
          ? {}
          : {
              navigation: [
                `axm ${request.types?.length === 1 && request.types[0] !== undefined ? `${toExtensionTypePlural(request.types[0])} ` : ""}list`,
              ],
            }),
        ...(pathFacts === undefined ? {} : { path: pathFacts }),
      };
      requests.push(result);
      for (const ref of result.subjectRefs) selected.add(ref);
    };
    if (request.selection.kind === "identities") {
      for (const input of request.selection.identities) {
        const sourceName = input.includes(":@") ? input.slice(0, input.indexOf(":@")) : undefined;
        const endpoint =
          sourceName === undefined
            ? undefined
            : registrySources.find((source) => source.name === sourceName)?.location.href;
        const matches = candidates.filter((candidate) =>
          matchesInspectionIdentity(input, candidate, endpoint),
        );
        const sharedMcpIdentity =
          input.includes("/") &&
          matches.length > 1 &&
          matches.every((candidate) => candidate.type === "mcp-server") &&
          new Set(
            matches.map((candidate) =>
              JSON.stringify([
                candidate.identity.fqn,
                candidate.identity.source.authority,
                candidate.identity.source.endpoint ??
                  candidate.identity.source.locator ??
                  candidate.identity.source.sourceName,
              ]),
            ),
          ).size === 1;
        select("identity", input, matches, matches.length > 1 && !sharedMcpIdentity);
      }
    } else if (request.selection.kind === "all") {
      const matches = candidates.filter(
        (candidate) =>
          candidate.inInventory &&
          ((request.agents?.length ?? 0) === 0 ||
            request.agents?.some(
              (agent) =>
                candidate.row?.agents.includes(agent) ||
                candidate.row?.configuredAgents?.includes(agent) ||
                candidate.row?.observedAgents?.includes(agent),
            )),
      );
      select("all", "--all", matches, false);
      // An empty inventory is a completed query.
      if (matches.length === 0)
        requests.splice(0, 1, {
          id: "request-1",
          kind: "all",
          input: "--all",
          resolution: "resolved",
          code: 0,
          subjectRefs: [],
          candidateRefs: [],
        });
    } else {
      for (const lexical of request.selection.paths) {
        const entry = path.resolve(location.baseDir, lexical);
        const prior = requests.find(
          (request) => request.kind === "path" && request.path?.entry === entry,
        );
        if (prior !== undefined && prior.path !== undefined) {
          const id = `request-${requests.length + 1}`;
          requests.push({ ...prior, id, input: lexical, path: { ...prior.path, lexical } });
          for (const [index, item] of extraItems.entries())
            if (prior.subjectRefs.includes(item.id))
              extraItems[index] = { ...item, requestRefs: [...item.requestRefs, id] };
          continue;
        }
        const observed = yield* Effect.result(fs.lstat(entry));
        const resolved = yield* Effect.result(fs.realPath(entry));
        const referent = Result.isSuccess(resolved) ? resolved.success : undefined;
        const matches: Array<InspectionCandidate> = [];
        let sharedContainer = false;
        for (const candidate of candidates) {
          if (
            entry === location.settingsPath &&
            candidate.node?.origins.some((origin) => origin.type === "settings")
          ) {
            matches.push(candidate);
            sharedContainer = true;
          }
          const root = candidate.canonicalPath;
          if (root !== undefined && isLexicallyWithin(path, root, entry)) {
            const realRoot = yield* Effect.result(fs.realPath(root));
            // A lexical child reached through a symlink outside the package is not owned.
            if (
              (referent === undefined ||
                (Result.isSuccess(realRoot) &&
                  isLexicallyWithin(path, realRoot.success, referent))) &&
              !matches.includes(candidate)
            )
              matches.push(candidate);
          }
          const row = preinspection?.items.find(
            (row) => row.type === candidate.type && row.name === candidate.name,
          );
          for (const unit of row?.nativeLocations ?? []) {
            if (unit.ownership === "unowned") continue;
            const addresses = [unit.address.path, ...unit.aliases].map((address) =>
              path.resolve(location.baseDir, address),
            );
            const exact = addresses.includes(entry);
            const parent = addresses.find((address) => isLexicallyWithin(path, address, entry));
            const ownedChild =
              !exact &&
              parent !== undefined &&
              unit.ownership === "owned" &&
              (unit.mechanism === "copied-directory"
                ? yield* copiedDirectoryOwnsPath(parent, entry)
                : unit.mechanism === "symlink" &&
                  referent !== undefined &&
                  root !== undefined &&
                  isLexicallyWithin(path, root, referent));
            if (!exact && !ownedChild) continue;
            sharedContainer ||= unit.address.kind !== "entry" && unit.address.kind !== "file";
            sharedContainer ||= unit.mechanism === "copied-directory";
            if (!matches.includes(candidate)) matches.push(candidate);
          }
        }
        const conflicting = matches.length > 1 && !sharedContainer;
        const facts = {
          lexical,
          entry,
          ...(referent === undefined ? {} : { referent }),
          unownedRemainder: sharedContainer || matches.length === 0,
        };
        if (
          matches.length === 0 &&
          (Result.isSuccess(observed) ||
            (Result.isFailure(observed) && observed.failure.reason._tag !== "NotFound"))
        ) {
          const id = `unmanaged-${extraItems.length + 1}`;
          const requestId = `request-${requests.length + 1}`;
          requests.push({
            id: requestId,
            kind: "path",
            input: lexical,
            resolution: "resolved",
            code: 0,
            subjectRefs: [id],
            candidateRefs: [],
            path: facts,
            reason: "No established AXM owner.",
          });
          extraItems.push({
            id,
            identity: {
              name: path.basename(entry),
              scope: location.scope,
              source: { authority: "unmanaged" },
            },
            requestRefs: [requestId],
            editing: { kind: "unmanaged", reason: "No established AXM edit owner." },
            desired: {
              state: "not-reached",
              direct: false,
              enabled: null,
              packOrigins: [],
              declarations: [],
              coverage: notApplicable,
            },
            accepted: { state: "not-applicable", coverage: notApplicable },
            observed: {
              state: Result.isSuccess(observed) ? "present" : "unreadable",
              path: entry,
              drift: "not-applicable",
              coverage: complete,
            },
            retention: { reasons: [], coverage: notApplicable },
            nativeLocationRefs: [],
            duplicateDiscoveries: [],
            nativeCoverage: notApplicable,
            agents: { configured: [], observed: [] },
            agentOutcomes: [],
            runtime: { state: "not-checked" },
          });
        } else select("path", lexical, matches, conflicting, facts);
      }
    }
    const chosen = candidates.filter((candidate) => selected.has(candidate.id));
    const inspected =
      preinspection ??
      (yield* inspectInventory({
        ...raw,
        items: raw.items.filter((row) =>
          chosen.some((candidate) => candidate.type === row.type && candidate.name === row.name),
        ),
      }));
    const inventory = yield* buildInventoryDocument(inspected);
    const native = createNativeLocationTable();
    const supporting = new Map<string, { id: string; identity: InspectionIdentity }>();
    const support = (candidate: InspectionCandidate) => {
      if (!selected.has(candidate.id))
        supporting.set(candidate.id, { id: candidate.id, identity: candidate.identity });
      return candidate.id;
    };
    for (const resolution of requests)
      for (const id of resolution.candidateRefs) {
        const candidate = candidates.find((candidate) => candidate.id === id);
        if (candidate !== undefined) support(candidate);
      }
    const unknownRoutes = unresolvedPackRoutes(graph);
    const routeReason = unresolvedPackRoutesText(unknownRoutes);
    const items = yield* Effect.forEach(chosen, (candidate) =>
      Effect.gen(function* () {
        const row =
          candidate.competingClaim === true
            ? undefined
            : inspected.items.find(
                (row) => row.type === candidate.type && row.name === candidate.name,
              );
        const detail =
          candidate.competingClaim === true
            ? undefined
            : inventory.items.find(
                (item) => item.type === candidate.type && item.name === candidate.name,
              );
        const node = candidate.node;
        let agentOutcomes: ReadonlyArray<ShowAgentOutcome> = row?.agentOutcomes ?? [];
        if (candidate.type === "mcp-server" && node !== undefined && node.enabled) {
          const inspectedMcp = yield* inspectDesiredMcpServer({
            nativeDirectoryInputs: location.nativeDirectoryInputs,
            workspaceRoot: location.baseDir,
            scope: location.scope,
            agentIds: configuredAgents,
            node,
            entry: (yield* settings.entries("mcp-server"))[candidate.name],
            canonicalPaths: row?.paths ?? [],
          });
          agentOutcomes = inspectedMcp.outcomes.map((outcome, index) => {
            const inspection = inspectedMcp.inspections[index];
            return {
              ...outcome,
              fields: [...(inspection?.fields ?? [])],
              warnings: [...(inspection?.warnings ?? [])],
              configuration:
                inspection?.status === "blocked" || inspection?.status === "unsupported"
                  ? "blocked"
                  : inspection?.status === "unverified"
                    ? "unverified"
                    : "valid",
              projection: inspection?.status ?? "unverified",
              readiness: inspection?.status === "match" ? "unverified" : "blocked",
              runtime: "not-checked",
              manualActions: [
                "Open the selected host's native MCP management interface to verify runtime behavior; passive inspection has not started or contacted this connection.",
              ],
            };
          });
        }
        const reachability = desiredReachability(graph, candidate);
        const source = candidate.identity.source.authority;
        const canonical =
          node === undefined ? undefined : (yield* observeDesiredCanonical(node)).observation;
        const root = canonical?.path ?? candidate.canonicalPath;
        const stat = root === undefined ? undefined : yield* Effect.result(fs.stat(root));
        let manifestVersion: string | undefined;
        if (root !== undefined && Result.isSuccess(stat ?? Result.fail(null))) {
          const text = yield* Effect.result(
            fs.readFileString(path.join(root, manifestFilenameForType(candidate.type))),
          );
          if (Result.isSuccess(text)) {
            const decoded = yield* Effect.result(
              Effect.try({
                try: (): unknown => JSON.parse(text.success),
                catch: () => undefined,
              }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(ManifestIdentitySchema))),
            );
            if (
              Result.isSuccess(decoded) &&
              decoded.success.type === candidate.type &&
              decoded.success.name === (candidate.accepted?.identity.name ?? candidate.name)
            )
              manifestVersion = decoded.success.version;
          }
        }
        const declarations: Array<InspectionItem["desired"]["declarations"][number]> = [];
        const reasons: Array<InspectionItem["retention"]["reasons"][number]> = [];
        const packOrigins: Array<string> = [];
        for (const origin of node?.origins ?? []) {
          if (origin.type === "settings") {
            declarations.push({
              kind: "direct",
              address: {
                path: location.settingsPath,
                keys: [SETTINGS_ENTRY_KEYS[candidate.type], origin.localName ?? candidate.name],
              },
              enabled: origin.enabled,
              ...(origin.source === undefined ? {} : { source: origin.source }),
              ...(origin.constraint === undefined ? {} : { constraint: origin.constraint }),
            });
            reasons.push({
              kind: "direct-declaration",
              detail: `Declared in ${location.settingsPath}.`,
            });
          } else {
            const pack = candidates.find(
              (item) => item.type === "pack" && item.identity.fqn === origin.pack.fqn,
            );
            const contributorRef =
              pack === undefined ? `pack-${supporting.size + 1}` : support(pack);
            if (pack === undefined)
              supporting.set(contributorRef, {
                id: contributorRef,
                identity: {
                  type: "pack",
                  name: origin.pack.fqn,
                  fqn: origin.pack.fqn,
                  scope: location.scope,
                  source: { authority: origin.pack.authority },
                },
              });
            declarations.push({
              kind: "pack",
              address: {
                path: origin.manifestPath,
                keys: ["dependencies", candidate.identity.fqn ?? candidate.name],
              },
              contributorRef,
              source: origin.source,
              constraint: origin.constraint,
              enabled: origin.enabled,
            });
            packOrigins.push(origin.pack.fqn);
            reasons.push({
              kind: "pack-route",
              contributorRef,
              detail: `Reached through ${origin.pack.fqn}.`,
            });
          }
        }
        if (source === "workspace")
          reasons.push({
            kind: "authored-content",
            detail: "Authored source remains independent of declarations.",
          });
        for (const other of candidates)
          if (other.id !== candidate.id && root !== undefined && other.canonicalPath === root)
            reasons.push({
              kind: "shared-package-consumer",
              contributorRef: support(other),
              detail: `The same package supplies ${other.type} ${other.name}.`,
            });
        const nativeLocationRefs = [...native.add(row?.nativeLocations ?? [], "observation")];
        let retentionCoverage = unknownRoutes.length === 0 ? complete : partial(routeReason);
        const competingReason =
          candidate.competingClaim === true
            ? "A competing source identity is established, but its independent declaration and ownership facts are unavailable from the conflicted desired graph."
            : undefined;
        if (competingReason !== undefined) {
          retentionCoverage = partial(competingReason);
          reasons.push({ kind: "insufficient-evidence", detail: competingReason });
        }
        if (unknownRoutes.length > 0)
          reasons.push({ kind: "insufficient-evidence", detail: routeReason });
        if (root !== undefined && source !== "workspace" && source !== "bundled") {
          const references = yield* Effect.result(
            inspectNativePackageReferences({
              workspaceRoot: location.baseDir,
              nativeDirectoryInputs: location.nativeDirectoryInputs,
              scope: location.scope,
              packageRoot: root,
            }),
          );
          if (Result.isFailure(references)) {
            const reason = `Native package references could not be established: ${String(references.failure)}`;
            retentionCoverage = partial(reason);
            reasons.push({ kind: "insufficient-evidence", detail: reason });
          } else
            for (const reference of references.success) {
              const firstKey = reference.keys?.[0];
              const address: OwnershipUnitAddress =
                firstKey === undefined
                  ? { kind: "file", path: reference.path }
                  : {
                      kind: "key-path",
                      path: reference.path,
                      keys: [firstKey, ...(reference.keys?.slice(1) ?? [])],
                    };
              const detail =
                reference.evidence === "structured-reference"
                  ? "A native process configuration field explicitly references package content; this grants no ownership or runtime claim."
                  : "Native configuration contains a conservative possible reference to executable package content; no exact registration is established.";
              const refs = native.add(
                [
                  {
                    scope: location.scope,
                    address,
                    aliases: [],
                    configuredConsumers:
                      reference.evidence === "structured-reference"
                        ? reference.readers.filter((reader) => configuredAgents.includes(reader))
                        : [],
                    potentialReaders: reference.readers,
                    policyReasons: [],
                    ownership: "unverified",
                    state: "retained",
                    availability: reference.readers.map((agentId) => ({
                      agentId,
                      state: "unverified",
                      reason: "Runtime was not checked.",
                    })),
                    reason: detail,
                  },
                ],
                "observation",
              );
              const locationRef = refs[0];
              if (locationRef !== undefined) {
                nativeLocationRefs.push(locationRef);
                reasons.push({
                  kind:
                    reference.evidence === "structured-reference"
                      ? "native-reference"
                      : "possible-native-reference",
                  locationRef,
                  detail,
                });
              }
            }
        }
        const observedState: InspectionItem["observed"]["state"] =
          source === "inline"
            ? "not-applicable"
            : stat === undefined
              ? "unverified"
              : Result.isSuccess(stat)
                ? "present"
                : stat.failure.reason._tag === "NotFound"
                  ? "absent"
                  : "unreadable";
        const editing: InspectionItem["editing"] =
          source === "workspace"
            ? {
                kind: root === undefined ? "unavailable" : "authored-source",
                ...(root === undefined ? {} : { address: { path: root } }),
                reason: "The workspace authored package owns its source.",
              }
            : source === "inline"
              ? {
                  kind: "inline-configuration",
                  address: {
                    path: location.settingsPath,
                    keys: [SETTINGS_ENTRY_KEYS[candidate.type], candidate.name],
                  },
                  reason: "The local declaration owns this inline configuration.",
                }
              : source === "bundled"
                ? {
                    kind: "bundled",
                    reason: "This content ships with AXM and has no workspace edit path.",
                  }
                : source === "unmanaged"
                  ? {
                      kind: "unmanaged",
                      reason: "No AXM authored package owns this native content.",
                    }
                  : source === "unknown"
                    ? { kind: "unknown", reason: "Source authority has not been established." }
                    : {
                        kind: "authoring-transition-required",
                        reason:
                          "Acquired content requires an explicit supported authoring transition.",
                      };
        const acceptedVersion =
          candidate.accepted === undefined ? undefined : lockEntryVersion(candidate.accepted);
        const packProblems =
          candidate.type === "pack"
            ? graph.problems.filter(
                (problem) => "pack" in problem && problem.pack === candidate.identity.fqn,
              )
            : [];
        let observationCoverage =
          observedState === "unverified" ||
          observedState === "unreadable" ||
          packProblems.length > 0
            ? partial(
                packProblems.length === 0
                  ? "Canonical content could not be fully observed."
                  : packProblems.map(desiredStateProblemText).join("; "),
              )
            : source === "inline"
              ? notApplicable
              : complete;
        const membership =
          candidate.type === "pack"
            ? graph.packMembership.find((membership) => membership.settingsName === candidate.name)
            : undefined;
        const memberEvidence =
          candidate.type === "pack" && root !== undefined && candidate.identity.fqn !== undefined
            ? yield* Effect.result(
                inspectPackMembers({ root, packFqn: candidate.identity.fqn, graph }),
              )
            : undefined;
        const memberFailure =
          memberEvidence !== undefined && Result.isFailure(memberEvidence)
            ? `Pack member evidence could not be fully observed: ${String(memberEvidence.failure)}`
            : undefined;
        if (memberFailure !== undefined) observationCoverage = partial(memberFailure);
        const pack: InspectionItem["pack"] =
          membership === undefined
            ? undefined
            : {
                membership: memberFailure === undefined ? membership.declared.status : "unknown",
                routes: membership.routes,
                members:
                  memberEvidence === undefined || Result.isFailure(memberEvidence)
                    ? []
                    : memberEvidence.success.map((member) => {
                        const known = candidates.find(
                          (candidate) =>
                            candidate.identity.fqn === member.fqn &&
                            (member.sourceIdentity === null
                              ? member.declaration.endpoint !== null &&
                                candidate.identity.source.authority === "registry" &&
                                candidate.identity.source.endpoint === member.declaration.endpoint
                              : candidate.identity.source.authority ===
                                  member.sourceIdentity.authority &&
                                (member.sourceIdentity.endpoint === null ||
                                  candidate.identity.source.endpoint ===
                                    member.sourceIdentity.endpoint) &&
                                (member.sourceIdentity.locator === null ||
                                  candidate.identity.source.locator ===
                                    member.sourceIdentity.locator)),
                        );
                        const id =
                          known === undefined ? `member-${supporting.size + 1}` : support(known);
                        if (known === undefined)
                          supporting.set(id, {
                            id,
                            identity: {
                              name: member.fqn,
                              fqn: member.fqn,
                              scope: location.scope,
                              source:
                                member.sourceIdentity === null
                                  ? member.declaration.endpoint === null
                                    ? { authority: "unknown" }
                                    : {
                                        authority: "registry",
                                        endpoint: member.declaration.endpoint,
                                      }
                                  : {
                                      authority: member.sourceIdentity.authority,
                                      ...(member.sourceIdentity.endpoint === null
                                        ? {}
                                        : { endpoint: member.sourceIdentity.endpoint }),
                                      ...(member.sourceIdentity.locator === null
                                        ? {}
                                        : { locator: member.sourceIdentity.locator }),
                                    },
                            },
                          });
                        return { ...member, subjectRef: id };
                      }),
                ...(memberFailure !== undefined
                  ? { reason: memberFailure }
                  : membership.declared.status === "unknown"
                    ? { reason: membership.declared.reason }
                    : {}),
              };
        const mcp =
          candidate.type === "mcp-server"
            ? yield* inspectMcpPackageFacts({
                name: candidate.name,
                paths: row?.paths ?? [],
                accepted: candidate.accepted !== undefined,
              })
            : undefined;
        if (mcp?.cwd === "missing")
          agentOutcomes = agentOutcomes.map((outcome) => ({
            ...outcome,
            readiness: "blocked",
            warnings: [
              ...(outcome.warnings ?? []),
              "The configured working directory is missing or is not a directory.",
            ],
          }));
        return {
          id: candidate.id,
          identity: candidate.identity,
          requestRefs: requests
            .filter((result) => result.subjectRefs.includes(candidate.id))
            .map((result) => result.id),
          editing,
          desired: {
            state: competingReason === undefined ? reachability.decision : "unknown",
            direct: declarations.some((declaration) => declaration.kind === "direct"),
            enabled: node?.enabled ?? null,
            packOrigins: [...new Set(packOrigins)],
            declarations,
            ...(node?.preference === undefined
              ? {}
              : {
                  preference: {
                    address: {
                      path: location.settingsPath,
                      keys: [SETTINGS_ENTRY_KEYS[candidate.type], node.preference.localName],
                    },
                    ...(node.preference.enabled === undefined
                      ? {}
                      : { enabled: node.preference.enabled }),
                  },
                }),
            coverage:
              competingReason !== undefined
                ? partial(competingReason)
                : unknownRoutes.length === 0
                  ? complete
                  : partial(routeReason),
          },
          accepted: {
            state:
              candidate.accepted !== undefined
                ? "present"
                : source === "workspace" || source === "inline" || source === "bundled"
                  ? "not-applicable"
                  : "absent",
            ...(acceptedVersion === undefined ? {} : { version: acceptedVersion }),
            ...(candidate.accepted === undefined
              ? {}
              : { source: acceptedInspectionSource(candidate.accepted) }),
            coverage: complete,
          },
          observed: {
            state: observedState,
            ...(root === undefined ? {} : { path: root }),
            ...(manifestVersion === undefined ? {} : { manifestVersion }),
            ...(canonical === undefined ? {} : { canonicalStatus: canonical.status }),
            drift:
              canonical?.status === "materialization-mismatch"
                ? "detected"
                : canonical?.status === "usable" && candidate.accepted !== undefined
                  ? "not-detected"
                  : source === "inline"
                    ? "not-applicable"
                    : "not-checked",
            coverage: observationCoverage,
          },
          retention: { reasons, coverage: retentionCoverage },
          nativeLocationRefs: [...new Set(nativeLocationRefs)],
          duplicateDiscoveries: (row?.duplicateDiscoveries ?? []).map((duplicate) => ({
            agentId: duplicate.agentId,
            nativeLocationRefs: native.add(
              (row?.nativeLocations ?? []).filter((unit) =>
                duplicate.nativeUnits.some((ref) => nativeUnitKey(ref) === nativeUnitKey(unit)),
              ),
              "observation",
            ),
          })),
          nativeCoverage:
            row?.inspectionState === "not-applicable"
              ? notApplicable
              : row?.inspectionState === "complete"
                ? complete
                : partial("Native inspection is incomplete or unavailable."),
          agents: {
            configured: detail?.agents.configured ?? [],
            observed: detail?.agents.observed ?? [],
          },
          agentOutcomes: filterShowAgentOutcomes({
            outcomes: agentOutcomes,
            requested: request.agents ?? [],
            configured: configuredAgents,
            type: candidate.type,
            name: candidate.name,
          }).map(({ extensionType: _extensionType, name: _name, ...facts }) => facts),
          ...(detail !== undefined &&
          "knowledge" in detail.inspection &&
          detail.inspection.knowledge !== undefined
            ? { knowledge: detail.inspection.knowledge }
            : {}),
          runtime: { state: "not-checked" },
          ...(pack === undefined ? {} : { pack }),
          ...(mcp === undefined ? {} : { mcp }),
        } satisfies InspectionItem;
      }),
    );
    const diagnostics = [
      ...(raw.observationDiagnostics ?? []),
      ...graph.problems.map((problem) => ({
        message: desiredStateProblemText(problem),
        code: problem.type,
      })),
      ...(yield* inspectionReadDiagnostics),
    ];
    return {
      scope: location.scope,
      requests,
      items: [...items, ...extraItems],
      supportingSubjects: [...supporting.values()],
      nativeLocations: native.records(),
      nativeReaderDeclarations: native.readerDeclarations(),
      observationDiagnostics: diagnostics,
      coverage:
        requests.some((result) => result.code !== 0) ||
        diagnostics.length > 0 ||
        items.some(
          (item) =>
            item.desired.coverage.state === "partial" ||
            item.observed.coverage.state === "partial" ||
            item.retention.coverage.state === "partial",
        )
          ? partial(
              "Some selections or observations are incomplete; inspect their individual coverage and diagnostics.",
            )
          : complete,
    } satisfies LocalInspectionDocument;
  }, withLocalInspectionReadView),
};
