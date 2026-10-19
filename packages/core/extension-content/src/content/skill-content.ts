/**
 * SKILL.md frontmatter validation and parsing.
 *
 * Validates SKILL.md frontmatter against the pinned Agent Skills standard and
 * combines the shared frontmatter utility with that validation in a parser.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import { parseFrontmatterSync } from "./frontmatter.js";
import type { Skill } from "./skill-types.js";
import {
  AGENT_SKILLS_COMPATIBILITY_MAX_LENGTH,
  AGENT_SKILLS_DESCRIPTION_MAX_LENGTH,
  AGENT_SKILLS_FRONTMATTER_FIELDS,
  AGENT_SKILLS_NAME_MAX_LENGTH,
} from "./agent-skills-standard.js";

/**
 * Agent Skills standard metadata at the top of a SKILL.md file, as accepted
 * by {@link validateSkillFrontmatter} (the single authority for its rules).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillFrontmatter {
  readonly name: string;
  readonly description: string;
  readonly license?: string;
  readonly compatibility?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly "allowed-tools"?: string;
}

export type SkillFrontmatterValidation =
  | { readonly valid: true; readonly frontmatter: SkillFrontmatter }
  | { readonly valid: false; readonly errors: ReadonlyArray<string> };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const allowedFrontmatterFields = new Set<string>(AGENT_SKILLS_FRONTMATTER_FIELDS);

/** Best-effort display metadata from an externally distributed skill. */
export interface ExtractedSkillMetadata {
  readonly name?: string;
  readonly description?: string;
  readonly metadata?: unknown;
  readonly frontmatter?: Readonly<Record<string, unknown>>;
}

/**
 * Read descriptive metadata without imposing a conformance gate. The source
 * remains authoritative: unknown fields, display names and metadata values are
 * retained as declared. Missing or malformed metadata does not make an explicit
 * SKILL.md path unavailable to acquisition.
 */
export const extractSkillMetadata = (content: string): ExtractedSkillMetadata => {
  try {
    const { frontmatter } = parseFrontmatterSync(content.replace(/^\uFEFF/, ""));
    if (!isRecord(frontmatter)) return {};
    const name = frontmatter["name"];
    const description = frontmatter["description"];
    return {
      ...(typeof name === "string" && name.trim().length > 0 ? { name } : {}),
      ...(typeof description === "string" && description.trim().length > 0 ? { description } : {}),
      ...(frontmatter["metadata"] === undefined ? {} : { metadata: frontmatter["metadata"] }),
      frontmatter,
    };
  } catch {
    return {};
  }
};

/**
 * Choose a native directory component without changing the skill declaration.
 * The fallback is the caller's already validated source/package identity, never
 * the physical content directory (which may be named src in an AXM envelope).
 */
export const skillDirectoryName = (declaredName: string | undefined, fallback: string): string => {
  const reserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
  if (
    declaredName === undefined ||
    declaredName.length === 0 ||
    declaredName.trim() !== declaredName ||
    declaredName === "." ||
    declaredName === ".." ||
    declaredName.endsWith(".") ||
    /[<>:"/\\|?*]/u.test(declaredName) ||
    [...declaredName].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    reserved.test(declaredName) ||
    new TextEncoder().encode(declaredName).length > 255
  )
    return reserved.test(fallback) ? `skill-${fallback}` : fallback;
  return declaredName;
};

/** Validate parsed YAML against the pinned Agent Skills metadata contract. */
export const validateSkillFrontmatter = (
  input: unknown,
  expectedDirectoryName?: string,
): SkillFrontmatterValidation => {
  if (!isRecord(input)) {
    return { valid: false, errors: ["SKILL.md frontmatter must be a YAML mapping"] };
  }

  const errors: Array<string> = [];
  const unexpected = Object.keys(input)
    .filter((key) => !allowedFrontmatterFields.has(key))
    .sort();
  if (unexpected.length > 0) {
    errors.push(`Unexpected frontmatter fields: ${unexpected.join(", ")}`);
  }

  const nameValue = input["name"];
  let normalizedName: string | undefined;
  if (typeof nameValue !== "string" || nameValue.trim().length === 0) {
    errors.push("Field 'name' must be a non-empty string");
  } else {
    normalizedName = nameValue.trim().normalize("NFKC");
    if ([...normalizedName].length > AGENT_SKILLS_NAME_MAX_LENGTH) {
      errors.push(`Skill name exceeds ${AGENT_SKILLS_NAME_MAX_LENGTH} character limit`);
    }
    if (normalizedName !== normalizedName.toLowerCase()) {
      errors.push("Skill name must be lowercase");
    }
    if (normalizedName.startsWith("-") || normalizedName.endsWith("-")) {
      errors.push("Skill name cannot start or end with a hyphen");
    }
    if (normalizedName.includes("--")) {
      errors.push("Skill name cannot contain consecutive hyphens");
    }
    if (![...normalizedName].every((character) => /[\p{L}\p{N}-]/u.test(character))) {
      errors.push("Skill name may contain only Unicode letters, numbers, and hyphens");
    }
    if (
      expectedDirectoryName !== undefined &&
      expectedDirectoryName.normalize("NFKC") !== normalizedName
    ) {
      errors.push(
        `Directory name '${expectedDirectoryName}' must match skill name '${normalizedName}'`,
      );
    }
  }

  const descriptionValue = input["description"];
  if (typeof descriptionValue !== "string" || descriptionValue.trim().length === 0) {
    errors.push("Field 'description' must be a non-empty string");
  } else if ([...descriptionValue].length > AGENT_SKILLS_DESCRIPTION_MAX_LENGTH) {
    errors.push(`Description exceeds ${AGENT_SKILLS_DESCRIPTION_MAX_LENGTH} character limit`);
  }

  const licenseValue = input["license"];
  if (licenseValue !== undefined && typeof licenseValue !== "string") {
    errors.push("Field 'license' must be a string");
  }

  const compatibilityValue = input["compatibility"];
  if (compatibilityValue !== undefined) {
    if (typeof compatibilityValue !== "string" || compatibilityValue.trim().length === 0) {
      errors.push("Field 'compatibility' must be a non-empty string");
    } else if ([...compatibilityValue].length > AGENT_SKILLS_COMPATIBILITY_MAX_LENGTH) {
      errors.push(`Compatibility exceeds ${AGENT_SKILLS_COMPATIBILITY_MAX_LENGTH} character limit`);
    }
  }

  const metadataValue = input["metadata"];
  const metadata: Record<string, string> = {};
  if (metadataValue !== undefined) {
    if (!isRecord(metadataValue)) {
      errors.push("Field 'metadata' must be a mapping from strings to strings");
    } else {
      for (const [key, value] of Object.entries(metadataValue)) {
        if (typeof value !== "string") {
          errors.push(`Metadata value for '${key}' must be a string`);
        } else {
          metadata[key] = value;
        }
      }
    }
  }

  const allowedToolsValue = input["allowed-tools"];
  if (allowedToolsValue !== undefined) {
    if (typeof allowedToolsValue !== "string" || !/^\S+(?: \S+)*$/u.test(allowedToolsValue)) {
      errors.push("Field 'allowed-tools' must be a non-empty space-delimited string");
    }
  }

  if (errors.length > 0 || normalizedName === undefined || typeof descriptionValue !== "string") {
    return { valid: false, errors };
  }

  return {
    valid: true,
    frontmatter: {
      name: normalizedName,
      description: descriptionValue,
      ...(licenseValue !== undefined && typeof licenseValue === "string"
        ? { license: licenseValue }
        : {}),
      ...(compatibilityValue !== undefined && typeof compatibilityValue === "string"
        ? { compatibility: compatibilityValue }
        : {}),
      ...(metadataValue !== undefined ? { metadata } : {}),
      ...(allowedToolsValue !== undefined && typeof allowedToolsValue === "string"
        ? { "allowed-tools": allowedToolsValue }
        : {}),
    },
  };
};

/**
 * Parse a SKILL.md file's content and extract skill metadata from frontmatter.
 *
 * Returns `Option.some(Skill)` when the file has valid YAML frontmatter with
 * non-empty `name` and `description` fields. Returns `Option.none()` for any
 * invalid input: missing frontmatter, invalid YAML, or missing/empty required fields.
 */
export const parseSkillMd = (
  content: string,
  expectedDirectoryName?: string,
): Option.Option<Skill> => {
  try {
    const parsed = parseFrontmatterSync(content);

    if (parsed.frontmatter === undefined) {
      return Option.none();
    }

    const validation = validateSkillFrontmatter(parsed.frontmatter, expectedDirectoryName);
    if (!validation.valid) {
      return Option.none();
    }
    const frontmatter = validation.frontmatter;

    return Option.some({
      name: frontmatter.name,
      description: frontmatter.description,
      metadata:
        frontmatter.metadata === undefined ? Option.none() : Option.some(frontmatter.metadata),
    });
  } catch {
    // Invalid YAML or other parsing errors — silently skip
    return Option.none();
  }
};
