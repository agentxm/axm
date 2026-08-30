/**
 * Result adapter: joins each executing specification file's exported metadata
 * onto its native test results as Allure labels. It consumes results without
 * controlling how specifications are authored — spec files stay plain
 * Vitest / @effect/vitest suites with one exported `specification` constant.
 */
import "allure-vitest/setup";

import { epic, feature, label, labels, story } from "allure-js-commons";
import { beforeEach } from "vitest";

import {
  EXECUTION_BOUNDARIES,
  EXECUTION_SELECTIONS,
  IDENTITY_SEGMENT_PATTERN,
  REQUIREMENT_CLASSES,
  REQUIREMENT_ROLES,
  type ExecutionBoundary,
  type ExecutionSelection,
  type RequirementClass,
  type RequirementRole,
  type SpecificationMetadata,
} from "./contract.js";

const isNonEmptyStringArray = (value: unknown): value is readonly [string, ...string[]] =>
  Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string");

const isRequirementClass = (value: unknown): value is RequirementClass =>
  typeof value === "string" && REQUIREMENT_CLASSES.some((entry) => entry === value);

const isRequirementRole = (value: unknown): value is RequirementRole =>
  typeof value === "string" && REQUIREMENT_ROLES.some((entry) => entry === value);

const isExecutionBoundary = (value: unknown): value is ExecutionBoundary =>
  typeof value === "string" && EXECUTION_BOUNDARIES.some((entry) => entry === value);

const isExecutionSelection = (value: unknown): value is ExecutionSelection =>
  typeof value === "string" && EXECUTION_SELECTIONS.some((entry) => entry === value);

const isValidRequirementIdentity = (value: unknown): value is string =>
  typeof value === "string" &&
  value.split("/").length >= 2 &&
  value.split("/").every((segment) => IDENTITY_SEGMENT_PATTERN.test(segment));

const readSpecificationMetadata = (
  filepath: string,
  moduleExports: unknown,
): SpecificationMetadata => {
  if (typeof moduleExports !== "object" || moduleExports === null) {
    throw new Error(`Specification module did not load as an object: ${filepath}`);
  }
  if (!("specification" in moduleExports)) {
    throw new Error(
      `Specification file must export a \`specification\` constant built with defineSpecification: ${filepath}`,
    );
  }
  const candidate: unknown = moduleExports.specification;
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error(`Exported \`specification\` must be a metadata object: ${filepath}`);
  }
  const record: Partial<Record<keyof SpecificationMetadata, unknown>> = candidate;
  if (!isValidRequirementIdentity(record.requirement)) {
    throw new Error(
      `Specification requirement identity must be two or more lowercase kebab segments joined by "/": ${filepath}`,
    );
  }
  if (typeof record.title !== "string" || record.title.length === 0) {
    throw new Error(`Specification title must be a non-empty string: ${filepath}`);
  }
  if (!isRequirementClass(record.class)) {
    throw new Error(`Specification class is not a known requirement class: ${filepath}`);
  }
  if (!isRequirementRole(record.role)) {
    throw new Error(`Specification role is not a known requirement role: ${filepath}`);
  }
  if (!isNonEmptyStringArray(record.goals)) {
    throw new Error(
      `Specification goals must name at least one registered product goal: ${filepath}`,
    );
  }
  if (record.boundary !== undefined && !isExecutionBoundary(record.boundary)) {
    throw new Error(`Specification boundary is not a known execution boundary: ${filepath}`);
  }
  if (record.selection !== undefined && !isExecutionSelection(record.selection)) {
    throw new Error(`Specification selection is not a known selection policy: ${filepath}`);
  }
  if (record.methods !== undefined && !isNonEmptyStringArray(record.methods)) {
    throw new Error(
      `Specification methods must be a non-empty string array when present: ${filepath}`,
    );
  }
  return {
    requirement: record.requirement,
    title: record.title,
    class: record.class,
    role: record.role,
    goals: record.goals,
    ...(record.boundary !== undefined ? { boundary: record.boundary } : {}),
    ...(record.methods !== undefined && isNonEmptyStringArray(record.methods)
      ? { methods: record.methods }
      : {}),
    ...(record.selection !== undefined ? { selection: record.selection } : {}),
  };
};

const SUBJECT_DISPLAY: Readonly<Record<string, string>> = {
  cli: "CLI",
  "extension-identity": "Extension Identity",
  "package-identity": "Package Identity",
  "settings-contract": "Settings Contract",
  "source-resolution": "Source Resolution",
  "version-constraints": "Version Constraints",
  system: "System",
};

const ROLE_DISPLAY: Readonly<Record<RequirementRole, string>> = {
  experience: "Product behavior",
  interface: "Programmatic interfaces",
  supporting: "Supporting system behavior",
};

const displaySegment = (segment: string): string =>
  SUBJECT_DISPLAY[segment] ??
  segment
    .split("-")
    .map((word) => (word.length > 0 ? `${word.slice(0, 1).toUpperCase()}${word.slice(1)}` : word))
    .join(" ");

beforeEach(async (context) => {
  const filepath = context.task.file.filepath;
  const moduleExports: unknown = await import(filepath);
  const specification = readSpecificationMetadata(filepath, moduleExports);

  const segments = specification.requirement.split("/");
  const area = segments[0] ?? "system";
  const capability = segments[1] ?? "general";

  await label("purpose", "specification");
  await label("requirement", specification.requirement);
  await label("requirement-class", specification.class);
  await label("requirement-role", specification.role);
  await label("boundary", specification.boundary ?? "memory");
  await label("selection", specification.selection ?? "per-change");
  await labels(
    ...specification.goals.map((goal) => ({ name: "product-goal", value: goal })),
    ...(specification.methods ?? []).map((method) => ({ name: "method", value: method })),
  );
  await epic(ROLE_DISPLAY[specification.role]);
  await feature(`${displaySegment(area)} — ${displaySegment(capability)}`);
  await story(specification.title);
});
