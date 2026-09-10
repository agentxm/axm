/**
 * Per-file purpose labelling for every owner project's test target.
 *
 * Each executing file is labelled by what it is — `specification`, `e2e`,
 * or `test` — from its filename, and the label travels with every test into
 * the execution receipt so a specification that ran without this setup never
 * counts as specification evidence. A specification file must export a valid
 * `specification` constant; its metadata joins the native results as Allure
 * labels. Spec files stay plain Vitest / @effect/vitest suites; nothing here
 * controls how they are authored.
 */
import "allure-vitest/setup";

import { epic, feature, label, labels, story } from "allure-js-commons";
import { beforeEach } from "vitest";

import { classifyTestPurpose } from "./scripts/test-purpose.js";

// The contract is loaded lazily (below), so its types are named through the
// module type rather than a static import.
type SpecificationContract = typeof import("@agentxm/specification-metadata");
type SpecificationMetadata = SpecificationContract["SpecificationMetadataSchema"]["Type"];
type SpecificationRole = SpecificationMetadata["role"];

const ROLE_DISPLAY: Readonly<Record<SpecificationRole, string>> = {
  experience: "Product behavior",
  interface: "Programmatic interfaces",
  supporting: "Supporting system behavior",
};

const readSpecificationMetadata = async (
  filepath: string,
  moduleExports: unknown,
): Promise<SpecificationMetadata> => {
  if (typeof moduleExports !== "object" || moduleExports === null) {
    throw new Error(`Specification module did not load as an object: ${filepath}`);
  }
  if (!("specification" in moduleExports)) {
    throw new Error(
      `Specification file must export a \`specification\` constant built with defineSpecification: ${filepath}`,
    );
  }
  // The contract package is a dependency of every project that owns a
  // specification (each file imports defineSpecification from it), so its
  // built surface exists whenever a specification runs; projects without
  // specifications never load it.
  const { decodeSpecificationMetadata } = await import("@agentxm/specification-metadata");
  const decoded = decodeSpecificationMetadata(moduleExports.specification);
  if (!decoded.ok) {
    throw new Error(
      `Specification metadata does not satisfy the shared contract: ${filepath}\n${decoded.issues.join("\n")}`,
    );
  }
  return decoded.value;
};

beforeEach(async (context) => {
  const filepath = context.task.file.filepath;
  const purpose = classifyTestPurpose(filepath);
  Object.assign(context.task.meta, { purpose });
  await label("purpose", purpose);
  if (purpose !== "specification") return;

  const moduleExports: unknown = await import(filepath);
  const specification = await readSpecificationMetadata(filepath, moduleExports);

  await label("requirement", specification.requirement);
  await label("requirement-class", specification.class);
  await label("requirement-role", specification.role);
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
  await feature(specification.goals[0]);
  await story(specification.title);
});
