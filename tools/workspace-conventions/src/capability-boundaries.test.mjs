import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";

import { capabilityBoundaries } from "./capability-boundaries.mjs";

const sourceFiles = "{ts,tsx,mts,cts,js,jsx,mjs,cjs}";

/** @param {string} type @param {string} pattern */
const capability = (type, pattern) => ({
  type,
  pattern,
  capture: ["strategy"],
  partialMatch: false,
});

const elements = [
  capability("frontstage", "packages/*/shop/src/cart"),
  capability("frontstage", "packages/*/shop/src/wishlist"),
  capability("backstage", "packages/*/shop/src/pricing"),
  capability("backstage", "packages/*/shop/src/inventory"),
  capability("frontstage", "packages/*/payments/src/invoices"),
  capability("backstage", "packages/*/primitives/src/ids"),
  { type: "test-support", pattern: "tools/test-world/src", partialMatch: false },
];

const paths = {
  cartPolicy: "packages/core/shop/src/cart/domain/select.ts",
  cartApplication: "packages/core/shop/src/cart/application/index.ts",
  cartAdapter: "packages/core/shop/src/cart/adapters/fs/index.ts",
  cartComposition: "packages/core/shop/src/cart/composition/index.ts",
  cartTest: "packages/core/shop/src/cart/application/select.test.ts",
  cartUnclassified: "packages/core/shop/src/cart/unclassified.ts",
  wishlistApplication: "packages/core/shop/src/wishlist/application/index.ts",
  wishlistComposition: "packages/core/shop/src/wishlist/composition/index.ts",
  wishlistUnclassified: "packages/core/shop/src/wishlist/unclassified.ts",
  pricingPolicy: "packages/core/shop/src/pricing/domain/index.ts",
  pricingPrivate: "packages/core/shop/src/pricing/domain/private.ts",
  pricingApplication: "packages/core/shop/src/pricing/application/index.ts",
  pricingAdapter: "packages/core/shop/src/pricing/adapters/rates/index.ts",
  pricingComposition: "packages/core/shop/src/pricing/composition/index.ts",
  inventoryPolicy: "packages/core/shop/src/inventory/domain/index.ts",
  invoicesApplication: "packages/supporting/payments/src/invoices/application/index.ts",
  genericPolicy: "packages/generic/primitives/src/ids/domain/index.ts",
  genericBuild: "packages/generic/primitives/dist/index.js",
  testWorld: "tools/test-world/src/index.ts",
  unknown: "packages/core/shop/src/unregistered/domain/index.ts",
};

/** @type {Parameters<typeof capabilityBoundaries>[0]["additionalAllows"]} */
const additionalAllows = [
  {
    from: { file: { categories: "adapter" } },
    allow: { to: { element: { type: "backstage", fileInternalPath: "domain/private.ts" } } },
  },
  {
    from: { file: { categories: "domain" } },
    allow: { to: { file: { categories: "adapter" } } },
  },
];

/** @type {Parameters<typeof capabilityBoundaries>[0]["additionalDenials"]} */
const additionalDenials = [
  {
    from: { file: { categories: "adapter" } },
    disallow: { to: { element: { type: "frontstage" } } },
    message: "Adapters in this workspace do not invoke frontstage workflows.",
  },
];

/** @type {string} */
let root = "";
/** @type {ESLint | undefined} */
let shared;
/** @type {ESLint | undefined} */
let extended;

/**
 * @param {string} cwd
 * @param {Omit<Parameters<typeof capabilityBoundaries>[0], "rootPath" | "elements" | "files">} options
 */
const linter = (cwd, options) =>
  new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: [`**/*.${sourceFiles}`],
        languageOptions: { parser: tseslint.parser },
      },
      ...capabilityBoundaries({
        rootPath: cwd,
        elements,
        files: [`packages/**/*.${sourceFiles}`],
        ...options,
      }),
    ],
  });

/** @param {string} path @param {string} content */
const write = async (path, content) => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
};

before(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "capability-boundaries-")));
  for (const path of Object.values(paths)) {
    await write(
      path,
      "export const value = 1;\nexport interface Value { readonly value: number }\n",
    );
  }
  // A workspace package whose source condition selects capability source and
  // whose default condition selects build output outside every element.
  await write(
    "packages/generic/primitives/package.json",
    JSON.stringify({
      name: "@fixture/primitives",
      type: "module",
      exports: {
        ".": { "fixture-source": "./src/ids/domain/index.ts", default: "./dist/index.js" },
      },
    }),
  );
  await mkdir(join(root, "node_modules/@fixture"), { recursive: true });
  await symlink(
    join(root, "packages/generic/primitives"),
    join(root, "node_modules/@fixture/primitives"),
  );
  await write(
    "node_modules/fixture-units/package.json",
    JSON.stringify({ name: "fixture-units", type: "module", main: "index.js" }),
  );
  await write("node_modules/fixture-units/index.js", "export const now = () => 0;\n");

  shared = linter(root, {});
  extended = linter(root, {
    additionalAllows,
    additionalDenials,
    policyExternalModules: ["fixture-units"],
    policyRestrictedImports: [
      {
        name: "fixture-units",
        importNames: ["now"],
        message: "Receive the current time through a port.",
      },
    ],
    testAccess: { categories: ["composition"], element: { type: "backstage" } },
    placementFiles: [`packages/core/shop/src/wishlist/**/*.${sourceFiles}`],
    resolverConditions: ["fixture-source", "import", "default"],
  });
});

after(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

/**
 * @param {string} from
 * @param {string} code
 * @param {ESLint | undefined} [eslint]
 */
async function lint(from, code, eslint = shared) {
  assert.ok(eslint, "The fixture linter must be ready");
  const [result] = await eslint.lintText(code, { filePath: from });
  assert.ok(result, "ESLint must analyze the fixture");
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  return result.messages;
}

/**
 * @param {string} from
 * @param {string} to
 * @param {{ kind?: "value" | "type", eslint?: ESLint | undefined }} [options]
 */
async function dependency(from, to, { kind = "value", eslint = shared } = {}) {
  const source = `${root}/${to}`;
  const code =
    kind === "type"
      ? `import type { Value } from ${JSON.stringify(source)};`
      : `import { value } from ${JSON.stringify(source)}; void value;`;
  const messages = await lint(from, code, eslint);
  if (to !== paths.unknown) {
    assert.ok(
      !messages.some(({ ruleId }) => ruleId === "boundaries/no-unknown-dependencies"),
      JSON.stringify(messages),
    );
  }
  return messages;
}

/** @param {readonly import("eslint").Linter.LintMessage[]} messages @param {string} rule */
const reports = (messages, rule) =>
  assert.ok(
    messages.some(({ ruleId }) => ruleId === rule),
    JSON.stringify(messages),
  );

/** @param {readonly import("eslint").Linter.LintMessage[]} messages */
const boundaryMessages = (messages) =>
  messages.filter(({ ruleId }) => ruleId?.startsWith("boundaries/"));

for (const [name, from, to] of /** @type {const} */ ([
  [
    "frontstage application consumes a backstage contract",
    paths.cartApplication,
    paths.pricingApplication,
  ],
  [
    "supporting application consumes a core backstage contract",
    paths.invoicesApplication,
    paths.pricingApplication,
  ],
  [
    "a concrete domain algorithm consumes another domain contract",
    paths.pricingPolicy,
    paths.inventoryPolicy,
  ],
  ["an adapter implements its owner's domain contract", paths.pricingAdapter, paths.pricingPolicy],
  ["composition selects an owner's concrete adapter", paths.cartComposition, paths.cartAdapter],
  ["an owning test substitutes a concrete adapter", paths.cartTest, paths.cartAdapter],
  ["a test composes shared test support", paths.cartTest, paths.testWorld],
  [
    "composition wires frontstage application contracts",
    paths.pricingComposition,
    paths.cartApplication,
  ],
  [
    "an adapter can invoke a frontstage application contract",
    paths.pricingAdapter,
    paths.cartApplication,
  ],
])) {
  test(name, async () => assert.deepEqual(await dependency(from, to), []));
}

for (const [name, from, to, kind] of /** @type {const} */ ([
  [
    "backstage rejects a frontstage application",
    paths.pricingApplication,
    paths.cartApplication,
    "value",
  ],
  ["backstage rejects a frontstage type", paths.pricingPolicy, paths.cartApplication, "type"],
  ["domain rejects its own application", paths.cartPolicy, paths.cartApplication, "value"],
  ["domain rejects its own adapter", paths.pricingPolicy, paths.pricingAdapter, "value"],
  ["application rejects its own adapter", paths.cartApplication, paths.cartAdapter, "value"],
  ["application rejects composition", paths.cartApplication, paths.cartComposition, "value"],
  [
    "frontstage peers require an explicit outer workflow",
    paths.cartApplication,
    paths.wishlistApplication,
    "value",
  ],
  ["cross-capability private files stay private", paths.cartPolicy, paths.pricingPrivate, "value"],
  [
    "generic policy cannot depend on product policy",
    paths.genericPolicy,
    paths.pricingPolicy,
    "value",
  ],
  ["production cannot import a test", paths.cartAdapter, paths.cartTest, "value"],
  ["production cannot import shared test support", paths.cartAdapter, paths.testWorld, "value"],
  [
    "a test cannot reach another capability's composition by default",
    paths.cartTest,
    paths.pricingComposition,
    "value",
  ],
  [
    "unregistered capabilities fail dependency checks",
    paths.cartApplication,
    paths.unknown,
    "value",
  ],
])) {
  test(name, async () => {
    const messages = await dependency(from, to, { kind });
    assert.ok(boundaryMessages(messages).length > 0, JSON.stringify(messages));
  });
}

test("unknown production files fail even without imports", async () => {
  reports(await lint(paths.unknown, "export const value = 1;"), "boundaries/no-unknown-files");
});

test("a known capability cannot hide code outside an architectural role", async () => {
  reports(await lint(paths.cartUnclassified, "export const value = 1;"), "no-restricted-syntax");
});

for (const extension of ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"]) {
  test(`dependency rules analyze .${extension} source`, async () => {
    const path = paths.cartApplication.replace(/\.ts$/u, `.${extension}`);
    const source = JSON.stringify(`${root}/${paths.cartAdapter}`);
    reports(
      await lint(path, `import { value } from ${source}; void value;`),
      "boundaries/dependencies",
    );
  });
}

for (const form of [
  /** @param {string} source */ (source) => `export { value } from ${source};`,
  /** @param {string} source */ (source) => `export * from ${source};`,
  /** @param {string} source */ (source) => `const loaded = import(${source}); void loaded;`,
  /** @param {string} source */ (source) => `const loaded = require(${source}); void loaded;`,
]) {
  test(`private adapter access is rejected through ${form('"adapter"')}`, async () => {
    reports(
      await lint(paths.cartApplication, form(JSON.stringify(`${root}/${paths.cartAdapter}`))),
      "boundaries/dependencies",
    );
  });
}

test("domain cannot import a Node mechanism", async () => {
  reports(
    await lint(paths.cartPolicy, 'import { readFile } from "node:fs/promises"; void readFile;'),
    "boundaries/dependencies",
  );
});

test("an adapter can import its Node mechanism", async () => {
  assert.deepEqual(
    await lint(paths.cartAdapter, 'import { readFile } from "node:fs/promises"; void readFile;'),
    [],
  );
});

test("a barrel import cannot smuggle filesystem access into policy", async () => {
  reports(
    await lint(paths.cartPolicy, 'import { FileSystem } from "effect"; void FileSystem;'),
    "no-restricted-imports",
  );
});

test("ambient HTTP access remains outside application policy", async () => {
  reports(
    await lint(paths.cartApplication, 'void fetch("https://example.invalid");'),
    "no-restricted-globals",
  );
});

test("ambient process state remains outside domain policy", async () => {
  reports(await lint(paths.cartPolicy, "void process.env;"), "no-restricted-globals");
});

test("an additional allowance permits a dependency the shared policies reject", async () => {
  assert.ok(boundaryMessages(await dependency(paths.cartAdapter, paths.pricingPrivate)).length > 0);
  assert.deepEqual(
    await dependency(paths.cartAdapter, paths.pricingPrivate, { eslint: extended }),
    [],
  );
});

test("an additional allowance cannot override an invariant denial", async () => {
  reports(
    await dependency(paths.pricingPolicy, paths.pricingAdapter, { eslint: extended }),
    "boundaries/dependencies",
  );
});

test("an additional denial rejects an otherwise allowed dependency", async () => {
  assert.deepEqual(await dependency(paths.pricingAdapter, paths.cartApplication), []);
  const messages = await dependency(paths.pricingAdapter, paths.cartApplication, {
    eslint: extended,
  });
  assert.ok(
    messages.some(
      ({ ruleId, message }) =>
        ruleId === "boundaries/dependencies" && message.includes("do not invoke frontstage"),
    ),
    JSON.stringify(messages),
  );
});

test("policy external modules admit a named module into domain policy", async () => {
  const code = 'import { now } from "fixture-units"; void now;';
  reports(await lint(paths.cartPolicy, code), "boundaries/dependencies");
  assert.deepEqual(boundaryMessages(await lint(paths.cartPolicy, code, extended)), []);
});

test("policy restricted imports reject the named import in policy", async () => {
  const code = 'import { now } from "fixture-units"; void now;';
  assert.ok(
    !(await lint(paths.cartPolicy, code)).some(({ ruleId }) => ruleId === "no-restricted-imports"),
  );
  reports(await lint(paths.cartPolicy, code, extended), "no-restricted-imports");
  reports(await lint(paths.cartApplication, code, extended), "no-restricted-imports");
});

test("test access widens what tests may reach within its element scope", async () => {
  assert.deepEqual(
    await dependency(paths.cartTest, paths.pricingComposition, { eslint: extended }),
    [],
  );
  reports(
    await dependency(paths.cartTest, paths.wishlistComposition, { eslint: extended }),
    "boundaries/dependencies",
  );
});

test("placement files select which capabilities the placement rule checks", async () => {
  const code = "export const value = 1;";
  assert.ok(
    !(await lint(paths.cartUnclassified, code, extended)).some(
      ({ ruleId }) => ruleId === "no-restricted-syntax",
    ),
  );
  reports(await lint(paths.wishlistUnclassified, code, extended), "no-restricted-syntax");
});

test("resolver conditions select the source a workspace package import resolves to", async () => {
  const code = 'import { value } from "@fixture/primitives"; void value;';
  assert.ok(boundaryMessages(await lint(paths.cartAdapter, code)).length > 0);
  assert.deepEqual(boundaryMessages(await lint(paths.cartAdapter, code, extended)), []);
});
