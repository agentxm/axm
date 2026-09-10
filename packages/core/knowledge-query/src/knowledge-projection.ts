import type {
  KnowledgeActorRecord,
  KnowledgeAuthoredLink,
  KnowledgeConcept,
  KnowledgeDocumentKind,
  KnowledgeTrustTier,
} from "@agentxm/registry-protocol/unstable/knowledge/okf";

export type KnowledgeSearchableField =
  | "bundle"
  | "conceptId"
  | "title"
  | "description"
  | "tag"
  | "type"
  | "body"
  | "resource"
  | "status"
  | "staleAfter"
  | "generated"
  | "verified"
  | "trust";

export interface KnowledgeBodyPassage {
  readonly text: string;
  readonly section: ReadonlyArray<string>;
  /** One-based line within the frontmatter-stripped body. */
  readonly startLine: number;
  /** One-based inclusive line within the frontmatter-stripped body. */
  readonly endLine: number;
}

export interface KnowledgeSearchableUnit {
  readonly field: KnowledgeSearchableField;
  readonly text: string;
  readonly passageIndex?: number;
}

export interface KnowledgeOutgoingLink extends KnowledgeAuthoredLink {
  readonly origin: "authored";
  readonly sourceConceptId: string;
  readonly sourceRelativePath: string;
}

export interface KnowledgeBacklink {
  readonly origin: "derived-backlink";
  readonly sourceConceptId: string;
  readonly sourceRelativePath: string;
  readonly targetConceptId: string;
  readonly line: number;
}

export interface KnowledgeProjectedConcept {
  readonly bundle: string;
  readonly conceptId: string;
  readonly kind: KnowledgeDocumentKind;
  readonly title?: string;
  readonly description?: string;
  readonly tags?: ReadonlyArray<string>;
  readonly type?: string;
  readonly resource?: string;
  readonly status?: string;
  readonly staleAfter?: string;
  readonly generated?: KnowledgeActorRecord;
  readonly verified?: ReadonlyArray<KnowledgeActorRecord>;
  readonly trust?: KnowledgeTrustTier;
  /** Complete parsed frontmatter, including producer-defined extension properties. */
  readonly frontmatter?: Readonly<Record<string, unknown>>;
  readonly relativePath: string;
  readonly bodyPassages: ReadonlyArray<KnowledgeBodyPassage>;
  readonly searchableUnits: ReadonlyArray<KnowledgeSearchableUnit>;
  readonly outgoingLinks: ReadonlyArray<KnowledgeOutgoingLink>;
  readonly backlinks: ReadonlyArray<KnowledgeBacklink>;
}

export type KnowledgeFrontmatterPointerResult =
  | { readonly found: true; readonly value: unknown }
  | { readonly found: false; readonly reason: "invalid-pointer" | "not-found" };

const pointerToken = (token: string): string | undefined => {
  if (/~(?:[^01]|$)/u.test(token)) return undefined;
  return token.replace(/~1/gu, "/").replace(/~0/gu, "~");
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Resolve one RFC 6901 JSON Pointer against the preserved frontmatter mapping. */
export const resolveKnowledgeFrontmatterPointer = (
  frontmatter: Readonly<Record<string, unknown>> | undefined,
  pointer: string,
): KnowledgeFrontmatterPointerResult => {
  if (frontmatter === undefined) return { found: false, reason: "not-found" };
  if (pointer === "") return { found: true, value: frontmatter };
  if (!pointer.startsWith("/")) return { found: false, reason: "invalid-pointer" };

  let current: unknown = frontmatter;
  for (const encoded of pointer.slice(1).split("/")) {
    const token = pointerToken(encoded);
    if (token === undefined) return { found: false, reason: "invalid-pointer" };
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(token)) {
        return { found: false, reason: "not-found" };
      }
      const index = Number(token);
      if (!Number.isSafeInteger(index) || index >= current.length) {
        return { found: false, reason: "not-found" };
      }
      current = current[index];
      continue;
    }
    if (isRecord(current)) {
      if (!Object.prototype.hasOwnProperty.call(current, token)) {
        return { found: false, reason: "not-found" };
      }
      current = current[token];
      continue;
    }
    return { found: false, reason: "not-found" };
  }
  return { found: true, value: current };
};

interface Heading {
  readonly level: number;
  readonly title: string;
}

const bodyPassages = (body: string): ReadonlyArray<KnowledgeBodyPassage> => {
  const lines = body.split(/\r?\n/u);
  const headings: Heading[] = [];
  const passages: KnowledgeBodyPassage[] = [];
  let passageLines: string[] = [];
  let passageStart = 1;

  const flush = (endLine: number): void => {
    let leading = 0;
    while (passageLines[leading]?.trim().length === 0) leading += 1;
    let trailing = passageLines.length;
    while (trailing > leading && passageLines[trailing - 1]?.trim().length === 0) trailing -= 1;
    if (trailing > leading) {
      passages.push({
        text: passageLines.slice(leading, trailing).join("\n"),
        section: headings.map(({ title }) => title),
        startLine: passageStart + leading,
        endLine: endLine - (passageLines.length - trailing),
      });
    }
    passageLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const heading = /^(#{1,6})\s+(.+?)\s*$/u.exec(line);
    if (heading?.[1] !== undefined && heading[2] !== undefined) {
      flush(index);
      const level = heading[1].length;
      while ((headings.at(-1)?.level ?? 0) >= level) headings.pop();
      headings.push({ level, title: heading[2] });
      passageStart = index + 2;
      continue;
    }
    if (passageLines.length === 0) passageStart = index + 1;
    passageLines.push(line);
  }
  flush(lines.length);
  return passages;
};

const actorText = (actor: KnowledgeActorRecord): string =>
  actor.at === undefined ? actor.by : `${actor.by} ${actor.at}`;

const projectionBase = (
  bundle: string,
  concept: KnowledgeConcept,
): Omit<KnowledgeProjectedConcept, "backlinks"> => {
  const passages = bodyPassages(concept.body);
  const units: KnowledgeSearchableUnit[] = [];
  const addUnit = (
    field: KnowledgeSearchableField,
    text: string | undefined,
    passageIndex?: number,
  ): void => {
    if (text === undefined || text.length === 0) return;
    units.push({ field, text, ...(passageIndex === undefined ? {} : { passageIndex }) });
  };

  addUnit("bundle", bundle);
  addUnit("conceptId", concept.id);
  addUnit("title", concept.authoredTitle);
  addUnit("description", concept.description);
  for (const tag of concept.tags ?? []) addUnit("tag", tag);
  addUnit("type", concept.type);
  for (const [passageIndex, passage] of passages.entries()) {
    addUnit("body", passage.text, passageIndex);
  }
  addUnit("resource", concept.resource);
  addUnit("status", concept.status);
  addUnit("staleAfter", concept.staleAfter);
  if (concept.generated !== undefined) addUnit("generated", actorText(concept.generated));
  for (const verified of concept.verified ?? []) addUnit("verified", actorText(verified));
  addUnit("trust", concept.trust);

  return {
    bundle,
    conceptId: concept.id,
    kind: concept.kind,
    ...(concept.authoredTitle === undefined ? {} : { title: concept.authoredTitle }),
    ...(concept.description === undefined ? {} : { description: concept.description }),
    ...(concept.tags === undefined ? {} : { tags: concept.tags }),
    ...(concept.type === undefined ? {} : { type: concept.type }),
    ...(concept.resource === undefined ? {} : { resource: concept.resource }),
    ...(concept.status === undefined ? {} : { status: concept.status }),
    ...(concept.staleAfter === undefined ? {} : { staleAfter: concept.staleAfter }),
    ...(concept.generated === undefined ? {} : { generated: concept.generated }),
    ...(concept.verified === undefined ? {} : { verified: concept.verified }),
    ...(concept.trust === undefined ? {} : { trust: concept.trust }),
    ...(concept.frontmatter === undefined ? {} : { frontmatter: concept.frontmatter }),
    relativePath: concept.relativePath,
    bodyPassages: passages,
    searchableUnits: units,
    outgoingLinks: concept.authoredLinks.map((link) => ({
      ...link,
      origin: "authored",
      sourceConceptId: concept.id,
      sourceRelativePath: concept.relativePath,
    })),
  };
};

/** Build one bundle's immutable, graph-aware discovery projection. */
export const projectKnowledgeConcepts = (
  bundle: string,
  concepts: ReadonlyArray<KnowledgeConcept>,
): ReadonlyArray<KnowledgeProjectedConcept> => {
  const projected = concepts.map((concept) => projectionBase(bundle, concept));
  const backlinks = new Map<string, KnowledgeBacklink[]>();
  for (const concept of projected) {
    for (const link of concept.outgoingLinks) {
      if (link.resolvedConceptId === undefined) continue;
      const current = backlinks.get(link.resolvedConceptId) ?? [];
      current.push({
        origin: "derived-backlink",
        sourceConceptId: concept.conceptId,
        sourceRelativePath: concept.relativePath,
        targetConceptId: link.resolvedConceptId,
        line: link.line,
      });
      backlinks.set(link.resolvedConceptId, current);
    }
  }
  return projected.map((concept) => ({
    ...concept,
    backlinks: [...(backlinks.get(concept.conceptId) ?? [])].sort(
      (left, right) =>
        left.sourceConceptId.localeCompare(right.sourceConceptId) || left.line - right.line,
    ),
  }));
};
