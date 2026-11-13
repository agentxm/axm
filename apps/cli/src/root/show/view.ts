import type { LocalInspectionDocument } from "@agentxm/workspace-features/inspection";
import type { NativeLocationRecord } from "@agentxm/workspace-kernel/locations";
import {
  ABSENT,
  fieldsDoc,
  headlineDoc,
  paragraphDoc,
  tableDoc,
  suggestionsDoc,
  type Doc,
} from "../../screen/index.js";

const nativeAddress = (location: NativeLocationRecord): string => {
  const address = location.address;
  switch (address.kind) {
    case "key-path":
      return `${address.path} (${address.keys.join(" → ")})`;
    case "region":
      return `${address.path} (region ${address.region})`;
    case "hook-registrations":
      return `${address.path} (${address.settingsKey}; scripts: ${address.scriptRoots.join(", ")})`;
    case "entry":
    case "file":
      return address.path;
  }
};

const nativeDoc = (result: LocalInspectionDocument): Doc => [
  ...result.nativeReaderDeclarations.flatMap((declaration) => [
    ...headlineDoc("neutral", `Native reader declaration ${declaration.id}`),
    ...fieldsDoc(declaration, [
      { label: "Potential readers", value: (row) => row.potentialReaders.join(", ") || ABSENT },
      {
        label: "Availability default",
        value: (row) =>
          row.availabilityDefault === undefined
            ? "No shared observation declaration"
            : `${row.availabilityDefault.state} for ${row.availabilityDefault.appliesTo === "potential-readers" ? "declared potential readers" : row.availabilityDefault.appliesTo.join(", ")}${row.availabilityDefault.reason === undefined ? "" : `: ${row.availabilityDefault.reason}`}`,
      },
    ]),
  ]),
  ...result.nativeLocations.flatMap((location) => [
    ...headlineDoc("neutral", `Native location ${location.id}`),
    ...fieldsDoc(location, [
      { label: "Address", value: nativeAddress },
      { label: "Scope", value: (row) => row.scope },
      { label: "Evidence phase", value: (row) => row.phase },
      { label: "Aliases", value: (row) => row.aliases.join(", ") || ABSENT },
      {
        label: "Ownership",
        value: (row) => `${row.ownership}${row.proof === undefined ? "" : `: ${row.proof}`}`,
      },
      { label: "State", value: (row) => row.state },
      { label: "Mechanism", value: (row) => row.mechanism ?? ABSENT },
      {
        label: "Configured consumers",
        value: (row) => row.configuredConsumers.join(", ") || ABSENT,
      },
      {
        label: "Reader declaration",
        value: (row) => `${row.readerDeclarationRef}; availability is not implied`,
      },
      {
        label: "Availability",
        value: (row) =>
          [
            ...row.availability.observations.map(
              (observation) =>
                `${observation.agentId}: ${observation.state}${observation.reason === undefined ? "" : ` (${observation.reason})`}`,
            ),
          ].join("; ") || "No explicit availability observations",
      },
      { label: "Policy", value: (row) => row.policyReasons.join("; ") || ABSENT },
      { label: "Reason", value: (row) => row.reason ?? ABSENT },
    ]),
  ]),
];

const packDoc = (
  item: LocalInspectionDocument["items"][number],
  result: LocalInspectionDocument,
): Doc => {
  const pack = item.pack;
  if (pack === undefined) return [];
  const identities = new Map([
    ...result.items.map((subject) => [subject.id, subject.identity] as const),
    ...result.supportingSubjects.map((subject) => [subject.id, subject.identity] as const),
  ]);
  return [
    ...fieldsDoc(pack, [
      { label: "Pack membership", value: (value) => value.membership },
      { label: "Pack routes", value: (value) => value.routes },
      { label: "Membership evidence", value: (value) => value.reason ?? ABSENT },
    ]),
    ...tableDoc(pack.members, [
      {
        header: "Member",
        value: (member) =>
          identities.get(member.subjectRef)?.fqn ??
          identities.get(member.subjectRef)?.name ??
          member.subjectRef,
      },
      { header: "Constraint", value: (member) => member.declaration.constraint },
      { header: "Declared source", value: (member) => member.declaration.endpoint ?? "inherited" },
      { header: "Local names", value: (member) => member.localNames.join(", ") || ABSENT },
      {
        header: "Bound source",
        value: (member) =>
          member.sourceIdentity === null
            ? ABSENT
            : `${member.sourceIdentity.authority}: ${member.sourceIdentity.endpoint ?? member.sourceIdentity.locator ?? member.sourceIdentity.fqn ?? ABSENT}`,
      },
      {
        header: "Resolution",
        value: (member) =>
          `${member.resolution.status}${member.resolution.status === "unresolved" ? `: ${member.resolution.reason}` : ""}`,
      },
      { header: "Version", value: (member) => member.version ?? ABSENT },
      { header: "Reachability", value: (member) => member.reachability ?? ABSENT },
    ]),
  ];
};

export const localInspectionDoc = (result: LocalInspectionDocument): Doc => [
  ...paragraphDoc(
    `Inspection coverage: ${result.coverage.state}${result.coverage.reasons.length === 0 ? "" : `; ${result.coverage.reasons.join("; ")}`}`,
  ),
  ...(result.items.length === 0 && result.requests.every((request) => request.code === 0)
    ? paragraphDoc("No local subjects found.")
    : []),
  ...result.items.flatMap((item) => [
    ...headlineDoc("neutral", item.identity.fqn ?? item.identity.name),
    ...fieldsDoc(item, [
      { label: "Local name", value: (value) => value.identity.name },
      { label: "Type", value: (value) => value.identity.type ?? "unmanaged" },
      { label: "Scope", value: (value) => value.identity.scope },
      { label: "Source authority", value: (value) => value.identity.source.authority },
      {
        label: "Source",
        value: (value) => value.identity.source.locator ?? value.identity.source.endpoint ?? ABSENT,
      },
      {
        label: "Configured agents",
        value: (value) => value.agents.configured.join(", ") || ABSENT,
      },
      {
        label: "Native locations",
        value: (value) =>
          value.nativeLocationRefs
            .map(
              (id) =>
                result.nativeLocations.find((location) => location.id === id)?.address.path ?? id,
            )
            .join(", ") || "No native location established",
      },
      {
        label: "Native coverage",
        value: (value) =>
          `${value.nativeCoverage.state}${value.nativeCoverage.reasons.length === 0 ? "" : `: ${value.nativeCoverage.reasons.join("; ")}`}`,
      },
      {
        label: "Edit owner",
        value: (value) =>
          `${value.editing.kind}${value.editing.address === undefined ? "" : `: ${value.editing.address.path}${value.editing.address.keys === undefined ? "" : ` (${value.editing.address.keys.join(" → ")})`}`}`,
      },
      { label: "Desired", value: (value) => value.desired.state },
      {
        label: "Accepted",
        value: (value) =>
          `${value.accepted.state}${value.accepted.version === undefined ? "" : ` (${value.accepted.version})`}`,
      },
      {
        label: "Observed",
        value: (value) =>
          `${value.observed.state}${value.observed.path === undefined ? "" : `: ${value.observed.path}`}`,
      },
      { label: "Observed version", value: (value) => value.observed.manifestVersion ?? ABSENT },
      {
        label: "Retained because",
        value: (value) =>
          value.retention.reasons.map((reason) => reason.detail).join("; ") ||
          "No independent reason established by this inspection",
      },
      { label: "Runtime", value: (value) => value.runtime.state },
      {
        label: "Discovery",
        value: (value) =>
          value.duplicateDiscoveries
            .map(
              (duplicate) =>
                `${duplicate.agentId} already discovers ${duplicate.nativeLocationRefs.length} native locations`,
            )
            .join("; ") || "No duplicate discovery established",
      },
      {
        label: "Coverage",
        value: (value) =>
          [
            { label: "Desired", coverage: value.desired.coverage },
            { label: "Accepted", coverage: value.accepted.coverage },
            { label: "Observed", coverage: value.observed.coverage },
            { label: "Retention", coverage: value.retention.coverage },
          ]
            .map(
              ({ label, coverage }) =>
                `${label}: ${coverage.state}${coverage.reasons.length === 0 ? "" : ` (${coverage.reasons.join("; ")})`}`,
            )
            .join("; "),
      },
    ]),
    ...packDoc(item, result),
    ...(item.knowledge === undefined
      ? []
      : fieldsDoc(item.knowledge, [
          { label: "Concepts", value: (knowledge) => String(knowledge.concepts) },
          { label: "Knowledge diagnostics", value: (knowledge) => String(knowledge.diagnostics) },
        ])),
    ...(item.mcp === undefined
      ? []
      : [
          ...fieldsDoc(item.mcp, [
            { label: "Source version locked", value: (mcp) => String(mcp.sourceVersionLocked) },
            {
              label: "Runtime artifact pinned",
              value: (mcp) =>
                mcp.runtimeArtifactPinned === null
                  ? "not established"
                  : String(mcp.runtimeArtifactPinned),
            },
            { label: "Working directory", value: (mcp) => mcp.cwd },
          ]),
          ...tableDoc(item.mcp.distributions, [
            { header: "Distribution", value: (distribution) => distribution.id },
            { header: "Kind", value: (distribution) => distribution.kind },
            { header: "Transport", value: (distribution) => distribution.transport },
            { header: "Destination", value: (distribution) => distribution.destination },
            { header: "Selected", value: (distribution) => String(distribution.selected) },
            {
              header: "Support",
              value: (distribution) =>
                distribution.supported ? "supported" : (distribution.reason ?? "unsupported"),
            },
          ]),
          ...item.mcp.distributions.flatMap((distribution) =>
            tableDoc(
              distribution.inputs,
              [
                { header: "Input", value: (input) => input.id },
                { header: "Required", value: (input) => String(input.required) },
                { header: "Secret", value: (input) => String(input.secret) },
                { header: "Repeated", value: (input) => String(input.repeated) },
                { header: "Default", value: (input) => (input.hasDefault ? "declared" : ABSENT) },
              ],
              { caption: distribution.id },
            ),
          ),
        ]),
    ...tableDoc(item.agentOutcomes, [
      { header: "Agent", value: (outcome) => outcome.agentId },
      { header: "Outcome", value: (outcome) => outcome.outcome },
      { header: "Reason", value: (outcome) => outcome.reason },
    ]),
    ...item.agentOutcomes.flatMap((agent) => {
      const hook = agent.hook;
      if (hook === undefined) return [];
      return [
        ...headlineDoc("neutral", `${agent.agentId}: ${hook.implementationId}`),
        ...fieldsDoc(
          {
            protocol: hook.protocol,
            runtime: hook.runtimeAvailability,
            invocation: hook.nativeInvocation,
            conditions: hook.conditions.join("; ") || ABSENT,
            evidence: `${hook.fixtureEvidence.state}: ${hook.fixtureEvidence.reason}`,
          },
          [
            { label: "Protocol", value: (row) => row.protocol },
            { label: "Runtime availability", value: (row) => row.runtime },
            { label: "Native invocation", value: (row) => row.invocation },
            { label: "Conditions", value: (row) => row.conditions },
            { label: "Fixture evidence", value: (row) => row.evidence },
          ],
        ),
        ...tableDoc(hook.bindings, [
          { header: "Binding", value: (row) => row.id },
          { header: "Event", value: (row) => row.event },
          { header: "Matcher", value: (row) => row.matcher ?? ABSENT },
          { header: "Runtime", value: (row) => row.runtime },
          { header: "Entrypoint", value: (row) => row.entrypoint },
          {
            header: "Required outcomes",
            value: (row) => row.requiredOutcomes.join(", ") || ABSENT,
          },
          {
            header: "Required operations",
            value: (row) => row.requiredOperations.join(", ") || ABSENT,
          },
        ]),
        ...fieldsDoc(hook.configuration, [{ label: "Configuration", value: (row) => row.status }]),
        ...tableDoc(hook.configuration.fields, [
          { header: "Setting", value: (row) => row.key },
          { header: "Source", value: (row) => row.source },
          {
            header: "Value",
            value: (row) =>
              row.redacted ? "[redacted]" : row.value === null ? ABSENT : JSON.stringify(row.value),
          },
        ]),
        ...tableDoc(hook.configuration.issues, [
          { header: "Setting", value: (row) => row.key },
          { header: "Issue", value: (row) => row.message },
        ]),
        ...(hook.fixtureEvidence.receipt === undefined
          ? []
          : tableDoc(
              hook.fixtureEvidence.receipt.fixtures,
              [
                { header: "Fixture", value: (row) => row.fixture },
                { header: "Implementation", value: (row) => row.implementation },
                { header: "Result", value: (row) => row.outcome },
                { header: "Detail", value: (row) => row.detail },
              ],
              { caption: "Recorded fixture execution; native invocation was not observed" },
            )),
      ];
    }),
  ]),
  ...nativeDoc(result),
  ...result.requests
    .filter((request) => request.code !== 0)
    .flatMap((request) =>
      paragraphDoc(`${request.input}: ${request.resolution}. ${request.reason ?? ""}`),
    ),
  ...result.observationDiagnostics.flatMap((diagnostic) => paragraphDoc(diagnostic.message)),
  ...suggestionsDoc(
    [...new Set(result.requests.flatMap((request) => request.navigation ?? []))].map((cmd) => ({
      description: "Inspect available local entries",
      cmd,
    })),
  ),
];
