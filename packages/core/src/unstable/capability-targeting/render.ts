/**
 * Pure renderer for AXM capability-targeted Markdown.
 *
 * @experimental This API is unstable and may change without notice.
 */

export interface CapabilityRenderTarget {
  readonly agentId: string;
  readonly inheritedAgentIds: ReadonlyArray<string>;
  readonly capabilities: Readonly<Record<string, true | ReadonlyArray<string>>>;
  readonly tokens: Readonly<Record<string, string>>;
}

export interface CapabilityTargetingFinding {
  readonly code:
    | "invalid-directive-attributes"
    | "mismatched-directive"
    | "missing-default-variant"
    | "missing-replacement-region"
    | "orphan-directive"
    | "reserved-model-condition"
    | "rendered-artifact-drift"
    | "unclosed-directive"
    | "unknown-directive"
    | "unknown-directive-attribute"
    | "unresolved-token";
  readonly message: string;
  readonly structural: boolean;
}

export interface CapabilityTargetingRenderResult {
  readonly content: string;
  readonly didRender: boolean;
  readonly degraded: boolean;
  readonly findings: ReadonlyArray<CapabilityTargetingFinding>;
  readonly referencedCapabilities: ReadonlyArray<string>;
  readonly referencedConditions: ReadonlyArray<string>;
}

type DirectiveName = "axm-region" | "axm-enhance" | "axm-variants" | "axm-variant";

interface TextNode {
  readonly kind: "text";
  readonly value: string;
}

interface DirectiveNode {
  readonly kind: DirectiveName;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: ReadonlyArray<Node>;
  readonly sourceOrder: number;
  readonly passthrough: boolean;
}

type Node = TextNode | DirectiveNode;

interface MutableDirectiveNode {
  readonly kind: DirectiveName | "root";
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: Array<Node | MutableDirectiveNode>;
  readonly sourceOrder: number;
  readonly passthrough: boolean;
}

interface ParseSuccess {
  readonly ok: true;
  readonly nodes: ReadonlyArray<Node>;
  readonly findings: ReadonlyArray<CapabilityTargetingFinding>;
  readonly referencedCapabilities: ReadonlySet<string>;
  readonly referencedConditions: ReadonlySet<string>;
}

interface ParseFailure {
  readonly ok: false;
  readonly findings: ReadonlyArray<CapabilityTargetingFinding>;
  readonly referencedCapabilities: ReadonlySet<string>;
  readonly referencedConditions: ReadonlySet<string>;
}

type ParseResult = ParseSuccess | ParseFailure;

const DIRECTIVE_LINE = /^\s*<(\/)?(axm-(?:region|enhance|variants|variant))\b([^>]*)>\s*$/;
const FENCE_LINE = /^\s*(`{3,}|~{3,})/;
const TOKEN = /\{\{\s*([a-z]+:[a-z0-9][a-z0-9-]*)\s*(?:\|([^{}]*?))?\s*\}\}/g;
const ANY_AXM_DIRECTIVE_LINE = /^\s*<(\/)?(axm-[a-z0-9-]+)\b[^>]*>\s*$/;

const directiveNames = new Set<string>([
  "axm-region",
  "axm-enhance",
  "axm-variants",
  "axm-variant",
]);

const isDirectiveName = (value: string): value is DirectiveName => directiveNames.has(value);

const finding = (
  code: CapabilityTargetingFinding["code"],
  message: string,
  structural: boolean,
): CapabilityTargetingFinding => ({ code, message, structural });

const allowedAttributes: Readonly<Record<DirectiveName, ReadonlySet<string>>> = {
  "axm-region": new Set(["id"]),
  "axm-enhance": new Set(["agent", "id", "model", "replaces", "when"]),
  "axm-variants": new Set(["id"]),
  "axm-variant": new Set(["agent", "id", "model", "when"]),
};

const parseAttributes = (
  raw: string,
  name: DirectiveName,
): {
  readonly attributes: Readonly<Record<string, string>>;
  readonly findings: ReadonlyArray<CapabilityTargetingFinding>;
  readonly valid: boolean;
  readonly passthrough: boolean;
} => {
  const attributes: Record<string, string> = {};
  const findings: Array<CapabilityTargetingFinding> = [];
  let cursor = 0;
  let passthrough = false;
  const attributePattern = /\s+([a-z][a-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gy;

  while (cursor < raw.length) {
    attributePattern.lastIndex = cursor;
    const match = attributePattern.exec(raw);
    if (match === null) {
      if (raw.slice(cursor).trim().length === 0) break;
      findings.push(
        finding("invalid-directive-attributes", `${name} contains invalid attribute syntax`, true),
      );
      return { attributes, findings, valid: false, passthrough: true };
    }

    const key = match[1];
    const value = match[2] ?? match[3];
    if (key === undefined || value === undefined) {
      findings.push(
        finding("invalid-directive-attributes", `${name} contains an unreadable attribute`, true),
      );
      return { attributes, findings, valid: false, passthrough: true };
    }
    if (key in attributes) {
      findings.push(
        finding("invalid-directive-attributes", `${name} repeats attribute "${key}"`, true),
      );
      return { attributes, findings, valid: false, passthrough: true };
    }
    attributes[key] = value;
    if (!allowedAttributes[name].has(key)) {
      passthrough = true;
      findings.push(
        finding(
          "unknown-directive-attribute",
          `${name} uses unknown attribute "${key}"; preserving its content without targeting`,
          true,
        ),
      );
    }
    if (key === "model") {
      passthrough = true;
      findings.push(
        finding(
          "reserved-model-condition",
          `${name} uses reserved attribute "model"; preserving its content without targeting`,
          true,
        ),
      );
    }
    cursor = attributePattern.lastIndex;
  }

  const validForKind =
    (name !== "axm-region" || (attributes["id"] ?? "").length > 0) &&
    (name !== "axm-enhance" ||
      (attributes["when"] ?? "").length > 0 ||
      (attributes["agent"] ?? "").length > 0);
  if (!validForKind) {
    const message =
      name === "axm-region"
        ? "axm-region requires a non-empty id attribute"
        : "axm-enhance requires when or agent";
    findings.push(finding("invalid-directive-attributes", message, true));
  }

  return {
    attributes,
    findings,
    valid: validForKind,
    passthrough,
  };
};

const appendText = (parent: MutableDirectiveNode, line: string): void => {
  const previous = parent.children[parent.children.length - 1];
  if (previous?.kind === "text") {
    parent.children[parent.children.length - 1] = {
      kind: "text",
      value: `${previous.value}${line}`,
    };
    return;
  }
  parent.children.push({ kind: "text", value: line });
};

const freezeNode = (node: Node | MutableDirectiveNode): Node => {
  if (node.kind === "text") return node;
  if (node.kind === "root") {
    return { kind: "text", value: node.children.map(freezeNode).map(renderRawNode).join("") };
  }
  return {
    kind: node.kind,
    attributes: node.attributes,
    children: node.children.map(freezeNode),
    sourceOrder: node.sourceOrder,
    passthrough: node.passthrough,
  };
};

const renderRawNode = (node: Node): string => {
  if (node.kind === "text") return node.value;
  return node.children.map(renderRawNode).join("");
};

const collectWhenCapabilities = (
  attributes: Readonly<Record<string, string>>,
  referenced: Set<string>,
  conditions: Set<string>,
): void => {
  const condition = attributes["when"];
  if (condition === undefined) return;
  for (const item of condition.split(/\s+/).filter((part) => part.length > 0)) {
    conditions.add(item);
    const separator = item.indexOf(":");
    referenced.add(separator === -1 ? item : item.slice(0, separator));
  }
};

const parse = (source: string): ParseResult => {
  const root: MutableDirectiveNode = {
    kind: "root",
    attributes: {},
    children: [],
    sourceOrder: -1,
    passthrough: false,
  };
  const stack: Array<MutableDirectiveNode> = [root];
  const findings: Array<CapabilityTargetingFinding> = [];
  const referencedCapabilities = new Set<string>();
  const referencedConditions = new Set<string>();
  const lines = source.match(/.*(?:\r\n|\n|\r|$)/g)?.filter((line) => line.length > 0) ?? [];
  let fence: { readonly marker: string; readonly length: number } | undefined;
  let sourceOrder = 0;

  for (const line of lines) {
    const lineWithoutEnding = line.replace(/(?:\r\n|\n|\r)$/, "");
    const fenceMatch = FENCE_LINE.exec(lineWithoutEnding);
    if (fence !== undefined) {
      appendText(stack[stack.length - 1] ?? root, line);
      const marker = fenceMatch?.[1];
      if (marker !== undefined && marker[0] === fence.marker && marker.length >= fence.length) {
        fence = undefined;
      }
      continue;
    }
    const openingFence = fenceMatch?.[1];
    if (openingFence !== undefined) {
      fence = { marker: openingFence[0] ?? "`", length: openingFence.length };
      appendText(stack[stack.length - 1] ?? root, line);
      continue;
    }

    const match = DIRECTIVE_LINE.exec(lineWithoutEnding);
    if (match === null) {
      appendText(stack[stack.length - 1] ?? root, line);
      continue;
    }

    const rawName = match[2];
    if (rawName === undefined || !isDirectiveName(rawName)) {
      appendText(stack[stack.length - 1] ?? root, line);
      continue;
    }
    const closing = match[1] === "/";
    if (closing) {
      if ((match[3] ?? "").trim().length > 0) {
        findings.push(
          finding(
            "invalid-directive-attributes",
            `${rawName} closing tag cannot have attributes`,
            true,
          ),
        );
        return { ok: false, findings, referencedCapabilities, referencedConditions };
      }
      const current = stack[stack.length - 1];
      if (current === undefined || current.kind === "root") {
        findings.push(finding("orphan-directive", `orphan closing tag ${rawName}`, true));
        return { ok: false, findings, referencedCapabilities, referencedConditions };
      }
      if (current.kind !== rawName) {
        findings.push(
          finding(
            "mismatched-directive",
            `expected closing tag ${current.kind}, received ${rawName}`,
            true,
          ),
        );
        return { ok: false, findings, referencedCapabilities, referencedConditions };
      }
      stack.pop();
      continue;
    }

    const parsed = parseAttributes(match[3] ?? "", rawName);
    findings.push(...parsed.findings);
    if (!parsed.valid) {
      return { ok: false, findings, referencedCapabilities, referencedConditions };
    }
    collectWhenCapabilities(parsed.attributes, referencedCapabilities, referencedConditions);
    const node: MutableDirectiveNode = {
      kind: rawName,
      attributes: parsed.attributes,
      children: [],
      sourceOrder,
      passthrough: parsed.passthrough,
    };
    sourceOrder += 1;
    (stack[stack.length - 1] ?? root).children.push(node);
    stack.push(node);
  }

  if (stack.length !== 1) {
    const current = stack[stack.length - 1];
    findings.push(
      finding("unclosed-directive", `unclosed directive ${current?.kind ?? "unknown"}`, true),
    );
    return { ok: false, findings, referencedCapabilities, referencedConditions };
  }

  return {
    ok: true,
    nodes: root.children.map(freezeNode),
    findings,
    referencedCapabilities,
    referencedConditions,
  };
};

interface ConditionScore {
  readonly agent: number;
  readonly graded: number;
  readonly capabilities: number;
}

const compareScore = (left: ConditionScore, right: ConditionScore): number =>
  left.agent - right.agent || left.graded - right.graded || left.capabilities - right.capabilities;

const conditionScore = (
  attributes: Readonly<Record<string, string>>,
  target: CapabilityRenderTarget,
): ConditionScore | undefined => {
  const agent = attributes["agent"];
  let agentScore = 0;
  if (agent !== undefined) {
    if (agent === target.agentId) agentScore = 2;
    else if (target.inheritedAgentIds.includes(agent)) agentScore = 1;
    else return undefined;
  }

  const condition = attributes["when"];
  if (condition === undefined) return { agent: agentScore, graded: 0, capabilities: 0 };
  const items = condition.split(/\s+/).filter((item) => item.length > 0);
  let graded = 0;
  for (const item of items) {
    const separator = item.indexOf(":");
    const capability = separator === -1 ? item : item.slice(0, separator);
    const grade = separator === -1 ? undefined : item.slice(separator + 1);
    const actual = target.capabilities[capability];
    if (actual === undefined) return undefined;
    if (grade !== undefined) {
      if (actual === true || !actual.includes(grade)) return undefined;
      graded += 1;
    }
  }
  return { agent: agentScore, graded, capabilities: items.length };
};

const canonicalize = (content: string): string => {
  const lines = content
    .replace(/\r\n|\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());
  const canonical: Array<string> = [];
  for (const line of lines) {
    if (line.length === 0 && canonical[canonical.length - 1] === "") continue;
    canonical.push(line);
  }
  while (canonical[0] === "") canonical.shift();
  while (canonical[canonical.length - 1] === "") canonical.pop();
  return canonical.length === 0 ? "" : `${canonical.join("\n")}\n`;
};

const resolveTokens = (
  content: string,
  target: CapabilityRenderTarget,
  findings: Array<CapabilityTargetingFinding>,
): string =>
  mapOutsideFences(content, (segment) =>
    segment.replace(TOKEN, (whole: string, tokenKey: string, fallback: string | undefined) => {
      const resolved = target.tokens[tokenKey];
      if (resolved !== undefined) return resolved;
      if (fallback !== undefined) return fallback.replace(/\s*\n\s*/g, " ").trim();
      findings.push(
        finding("unresolved-token", `token "${tokenKey}" has no target value or fallback`, false),
      );
      return whole;
    }),
  );

const mapOutsideFences = (content: string, transform: (segment: string) => string): string => {
  const lines = content.match(/.*(?:\r\n|\n|\r|$)/g)?.filter((line) => line.length > 0) ?? [];
  const output: Array<string> = [];
  let plain: Array<string> = [];
  let fenced: Array<string> = [];
  let fence: { readonly marker: string; readonly length: number } | undefined;

  const flushPlain = (): void => {
    if (plain.length === 0) return;
    output.push(transform(plain.join("")));
    plain = [];
  };
  const flushFenced = (): void => {
    if (fenced.length === 0) return;
    output.push(fenced.join(""));
    fenced = [];
  };

  for (const line of lines) {
    const marker = FENCE_LINE.exec(line.replace(/(?:\r\n|\n|\r)$/, ""))?.[1];
    if (fence !== undefined) {
      fenced.push(line);
      if (marker !== undefined && marker[0] === fence.marker && marker.length >= fence.length) {
        fence = undefined;
        flushFenced();
      }
      continue;
    }
    if (marker !== undefined) {
      flushPlain();
      fence = { marker: marker[0] ?? "`", length: marker.length };
      fenced.push(line);
      continue;
    }
    plain.push(line);
  }
  flushPlain();
  flushFenced();
  return output.join("");
};

const stripUnknownDirectives = (
  source: string,
  findings: Array<CapabilityTargetingFinding>,
): string => {
  const reported = new Set<string>();
  return mapOutsideFences(source, (segment) =>
    segment
      .split(/(?<=\n)/)
      .filter((line) => {
        const match = ANY_AXM_DIRECTIVE_LINE.exec(line.replace(/(?:\r\n|\n|\r)$/, ""));
        const name = match?.[2];
        if (name === undefined || isDirectiveName(name)) return true;
        if (!reported.has(name)) {
          reported.add(name);
          findings.push(
            finding(
              "unknown-directive",
              `unknown directive "${name}"; preserved its content without targeting`,
              true,
            ),
          );
        }
        return false;
      })
      .join(""),
  );
};

interface RenderState {
  readonly target: CapabilityRenderTarget;
  readonly findings: Array<CapabilityTargetingFinding>;
  readonly regions: ReadonlySet<string>;
  readonly replacements: ReadonlyMap<string, ReadonlyArray<DirectiveNode>>;
}

const renderNodes = (nodes: ReadonlyArray<Node>, state: RenderState): string =>
  nodes.map((node) => renderNode(node, state)).join("");

const bestSatisfied = (
  candidates: ReadonlyArray<DirectiveNode>,
  target: CapabilityRenderTarget,
): DirectiveNode | undefined => {
  let selected: { readonly node: DirectiveNode; readonly score: ConditionScore } | undefined;
  for (const node of candidates) {
    if (node.passthrough) continue;
    const score = conditionScore(node.attributes, target);
    if (score === undefined) continue;
    if (selected === undefined || compareScore(score, selected.score) > 0) {
      selected = { node, score };
    }
  }
  return selected?.node;
};

const renderNode = (node: Node, state: RenderState): string => {
  if (node.kind === "text") return node.value;
  if (node.passthrough) return renderNodes(node.children, state);

  switch (node.kind) {
    case "axm-region": {
      const id = node.attributes["id"] ?? "";
      const replacement = bestSatisfied(state.replacements.get(id) ?? [], state.target);
      return replacement === undefined
        ? renderNodes(node.children, state)
        : renderNodes(replacement.children, state);
    }
    case "axm-enhance": {
      const replacement = node.attributes["replaces"];
      if (replacement !== undefined && state.regions.has(replacement)) return "";
      if (conditionScore(node.attributes, state.target) === undefined) return "";
      return renderNodes(node.children, state);
    }
    case "axm-variants": {
      const variants = node.children.filter(
        (child): child is DirectiveNode => child.kind === "axm-variant",
      );
      const selected = bestSatisfied(variants, state.target);
      return selected === undefined ? "" : renderNodes(selected.children, state);
    }
    case "axm-variant":
      return renderNodes(node.children, state);
  }
};

const visitNodes = (nodes: ReadonlyArray<Node>, visit: (node: DirectiveNode) => void): void => {
  for (const node of nodes) {
    if (node.kind === "text") continue;
    visit(node);
    visitNodes(node.children, visit);
  }
};

const validateAndIndex = (
  nodes: ReadonlyArray<Node>,
  findings: Array<CapabilityTargetingFinding>,
): {
  readonly fatal: boolean;
  readonly regions: ReadonlySet<string>;
  readonly replacements: ReadonlyMap<string, ReadonlyArray<DirectiveNode>>;
} => {
  const regions = new Set<string>();
  const replacements = new Map<string, Array<DirectiveNode>>();
  let fatal = false;

  visitNodes(nodes, (node) => {
    if (node.kind === "axm-region") regions.add(node.attributes["id"] ?? "");
    if (node.kind === "axm-enhance") {
      const replacement = node.attributes["replaces"];
      if (replacement !== undefined) {
        const candidates = replacements.get(replacement) ?? [];
        candidates.push(node);
        replacements.set(replacement, candidates);
      }
    }
    if (node.kind === "axm-variants") {
      const variants = node.children.filter(
        (child): child is DirectiveNode => child.kind === "axm-variant",
      );
      const defaults = variants.filter(
        (variant) =>
          variant.attributes["when"] === undefined &&
          variant.attributes["agent"] === undefined &&
          variant.attributes["model"] === undefined,
      );
      if (defaults.length !== 1) {
        fatal = true;
        findings.push(
          finding(
            "missing-default-variant",
            "axm-variants requires one bare default axm-variant",
            true,
          ),
        );
      }
    }
  });

  for (const region of replacements.keys()) {
    if (regions.has(region)) continue;
    findings.push(
      finding(
        "missing-replacement-region",
        `axm-enhance replaces unknown region "${region}"; rendered additively`,
        true,
      ),
    );
  }

  return { fatal, regions, replacements };
};

const hasTargetingSyntax = (source: string): boolean => {
  let found = false;
  mapOutsideFences(source, (segment) => {
    TOKEN.lastIndex = 0;
    if (
      TOKEN.test(segment) ||
      segment.split(/\r\n|\n|\r/).some((line) => ANY_AXM_DIRECTIVE_LINE.test(line))
    ) {
      found = true;
    }
    TOKEN.lastIndex = 0;
    return segment;
  });
  return found;
};

/** Render canonical Markdown for one pinned agent capability profile. */
export const renderCapabilityTargetedMarkdown = (
  source: string,
  target: CapabilityRenderTarget,
): CapabilityTargetingRenderResult => {
  if (!hasTargetingSyntax(source)) {
    return {
      content: source,
      didRender: false,
      degraded: false,
      findings: [],
      referencedCapabilities: [],
      referencedConditions: [],
    };
  }

  const recoveryFindings: Array<CapabilityTargetingFinding> = [];
  const recoveredSource = stripUnknownDirectives(source, recoveryFindings);
  const parsed = parse(recoveredSource);
  const referencedCapabilities = Array.from(parsed.referencedCapabilities).sort();
  const referencedConditions = Array.from(parsed.referencedConditions).sort();
  if (!parsed.ok) {
    return {
      content: source,
      didRender: false,
      degraded: true,
      findings: [...recoveryFindings, ...parsed.findings],
      referencedCapabilities,
      referencedConditions,
    };
  }

  const findings = [...recoveryFindings, ...parsed.findings];
  const index = validateAndIndex(parsed.nodes, findings);
  if (index.fatal) {
    return {
      content: source,
      didRender: false,
      degraded: true,
      findings,
      referencedCapabilities,
      referencedConditions,
    };
  }

  const rendered = renderNodes(parsed.nodes, {
    target,
    findings,
    regions: index.regions,
    replacements: index.replacements,
  });
  const resolved = resolveTokens(rendered, target, findings);
  return {
    content: canonicalize(resolved),
    didRender: true,
    degraded: findings.some((item) => item.structural || item.code === "unresolved-token"),
    findings,
    referencedCapabilities,
    referencedConditions,
  };
};
