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
  decodeSpecificationMetadata,
  type SpecificationMetadata,
  type SpecificationRole,
} from "@agentxm/extension-model/unstable/specifications";

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
  const decoded = decodeSpecificationMetadata(moduleExports.specification);
  if (!decoded.ok) {
    throw new Error(
      `Specification metadata does not satisfy the shared contract: ${filepath}\n${decoded.issues.join("\n")}`,
    );
  }
  return decoded.value;
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

const ROLE_DISPLAY: Readonly<Record<SpecificationRole, string>> = {
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
  await label("requirement-status", specification.status);
  await label("boundary", specification.boundary ?? "memory");
  await label("selection", specification.selection ?? "per-change");
  if (specification.characteristic !== undefined) {
    await label("characteristic", specification.characteristic);
  }
  await labels(
    ...specification.goals.map((goal) => ({ name: "product-goal", value: goal })),
    ...specification.methods.map((method) => ({ name: "method", value: method })),
  );
  await epic(ROLE_DISPLAY[specification.role]);
  await feature(`${displaySegment(area)} — ${displaySegment(capability)}`);
  await story(specification.title);
});
