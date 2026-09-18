import { DETERMINED_REPAIR_RULE_IDS, type RenderedFinding } from "@agentxm/workspace/linting";

export interface LintHumanFinding {
  readonly severity: RenderedFinding["finding"]["severity"];
  readonly ruleId: string;
  readonly ruleDescription: string;
  readonly title: string;
  readonly details: ReadonlyArray<string>;
  readonly helps: ReadonlyArray<string>;
  readonly fixable: boolean;
  readonly path: string;
}

const severityOrder = (severity: LintHumanFinding["severity"]): number => {
  switch (severity) {
    case "error":
      return 0;
    case "warning":
      return 1;
    case "info":
      return 2;
  }
};

const compareFindings = (left: RenderedFinding, right: RenderedFinding): number => {
  const severity = severityOrder(left.finding.severity) - severityOrder(right.finding.severity);
  if (severity !== 0) return severity;
  const path = left.path.localeCompare(right.path);
  if (path !== 0) return path;
  const rule = left.finding.ruleId.localeCompare(right.finding.ruleId);
  return rule === 0 ? left.finding.message.localeCompare(right.finding.message) : rule;
};

const isSentenceStarter = (character: string): boolean => {
  const code = character.charCodeAt(0);
  return character === "`" || (code >= 65 && code <= 90);
};

const sentenceBoundary = (
  message: string,
): { readonly head: string; readonly tail: string } | undefined => {
  for (let index = 1; index < message.length - 1; index += 1) {
    if (message[index] !== "." || (message[index + 1] ?? "x").trim() !== "") continue;
    let tailStart = index + 1;
    while (tailStart < message.length && (message[tailStart] ?? "x").trim() === "") {
      tailStart += 1;
    }
    const starter = message[tailStart];
    if (starter !== undefined && isSentenceStarter(starter)) {
      return { head: message.slice(0, index + 1), tail: message.slice(tailStart) };
    }
  }
  return undefined;
};

const splitSentences = (message: string): ReadonlyArray<string> => {
  const sentences: Array<string> = [];
  let remaining = message.trim();
  while (remaining.length > 0) {
    const boundary = sentenceBoundary(remaining);
    if (boundary === undefined) {
      sentences.push(remaining);
      break;
    }
    sentences.push(boundary.head);
    remaining = boundary.tail;
  }
  return sentences;
};

const parseFindingMessage = (message: string) => {
  const marker = " Detail: ";
  const markerIndex = message.indexOf(marker);
  const lead = markerIndex === -1 ? message : message.slice(0, markerIndex);
  const trailing =
    markerIndex === -1 ? [] : splitSentences(message.slice(markerIndex + marker.length));
  const leadSentences = splitSentences(lead);
  const detail = trailing[0];
  return {
    title: leadSentences[0] ?? message.trim(),
    details: detail === undefined ? [] : [detail],
    helps: [...leadSentences.slice(1), ...trailing.slice(1)],
  };
};

const displayPath = (finding: RenderedFinding): string => {
  if (finding.finding.ruleId !== "workspace/skills-managed") return finding.path;
  if (finding.path === "." || finding.path === "..") return finding.path;
  const separator = finding.path.lastIndexOf("/");
  return separator <= 0 ? finding.path : finding.path.slice(0, separator);
};

const repairableRules: ReadonlySet<string> = new Set(DETERMINED_REPAIR_RULE_IDS);

export const toLintHumanFindings = (
  findings: ReadonlyArray<RenderedFinding>,
): ReadonlyArray<LintHumanFinding> =>
  [...findings].sort(compareFindings).map((finding) => {
    const parsed = parseFindingMessage(finding.finding.message);
    return {
      severity: finding.finding.severity,
      ruleId: finding.finding.ruleId,
      ruleDescription: finding.ruleDescription,
      title: parsed.title,
      details: parsed.details,
      helps: parsed.helps,
      fixable: repairableRules.has(finding.finding.ruleId),
      path: displayPath(finding),
    };
  });
