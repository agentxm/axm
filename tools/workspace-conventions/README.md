# @agentxm/workspace-conventions

Engineering conventions for Nx and pnpm TypeScript workspaces. It currently
provides one ESLint flat-config preset, `capabilityBoundaries`, that enforces
capability boundaries with
[`eslint-plugin-boundaries`](https://github.com/javierbrea/eslint-plugin-boundaries).

This is engineering support, not runtime code. It ships in the AXM release
cohort so other workspaces can lint against the same conventions, but no
runtime package depends on it. It is unstable: options and rules may change in
any release.

The package is plain ES modules with JSDoc types and is published from source,
so an `eslint.config.mjs` can import it without a build step.

## Capability boundaries

```js
import { capabilityBoundaries } from "@agentxm/workspace-conventions/capability-boundaries";

export default [
  // ...a parser for TypeScript sources, such as typescript-eslint's
  ...capabilityBoundaries({
    rootPath: import.meta.dirname,
    elements: [
      {
        type: "backstage",
        pattern: "packages/*/pricing/src",
        capture: ["strategy"],
        partialMatch: false,
      },
      {
        type: "frontstage",
        pattern: "packages/*/checkout/src",
        capture: ["strategy"],
        partialMatch: false,
      },
      { type: "test-support", pattern: "tools/test-world/src", partialMatch: false },
    ],
    files: ["packages/*/{pricing,checkout}/src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
  }),
];
```

Install `eslint-plugin-boundaries` and `eslint-import-resolver-typescript`
beside it; both are peer dependencies.

### Model

Each capability is an `eslint-plugin-boundaries` element whose `type` is
`frontstage` (a consumer-facing workflow) or `backstage` (a capability other
capabilities build on), and whose `strategy` capture (the first wildcard of
its pattern) names its strategic classification. A capability whose strategy
is `generic` may depend only on other generic capabilities. Elements of type `test-support` hold shared test
implementations.

Inside a capability, files take a category from their folder:

| Category      | Files                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test`        | `*.test.*`, `*.spec.*`, `*.shared-spec.*`, `test-helpers.*`, `testing.*`, anything under `test-support/` or `__fixtures__/`, and every `test-support` element |
| `domain`      | `domain/**`                                                                                                                                                   |
| `application` | `application/**`                                                                                                                                              |
| `adapter`     | `adapters/**`                                                                                                                                                 |
| `composition` | `composition/**`                                                                                                                                              |

`roleDescriptors` add file descriptors between the test category and the
folders, for example `domain-api` or `application-api` entries that a package
export map publishes.

The preset then enforces:

- **Dependencies.** A capability may use its own files. Other capabilities are
  reached through their public `domain/index.*` and `application/index.*`
  entries or `domain-api` and `application-api` files. Adapters, composition,
  and tests may import external and Node modules, domain and application files
  only the external modules `policyExternalModules` names, and tests may also
  import `test-support` elements. Composition may also select another
  capability's `adapters/*/index.*` and `composition/index.*`. Domain files
  never depend on application, adapter, composition, or test files;
  application files never depend on adapter, composition, or test files;
  backstage domain and application files never depend on frontstage
  capabilities; and adapters and composition never import tests. Every file
  and dependency must be classified.
- **Placement.** Capability code outside the four role folders and test files
  is rejected.
- **Policy mechanisms.** Domain and application files may not import Effect's
  filesystem and provider modules or read the `fetch` and `process` globals.

### Options

| Option                    | Default            | Effect                                                                                                                                     |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `rootPath`                | required           | Absolute workspace root the patterns are relative to                                                                                       |
| `elements`                | required           | Capability and `test-support` element descriptors                                                                                          |
| `files`                   | required           | Source files the dependency rules lint                                                                                                     |
| `roleDescriptors`         | `[]`               | Extra file descriptors, matched after tests and before the role folders                                                                    |
| `additionalAllows`        | `[]`               | Dependency policies placed after the shared allowances and before the invariant denials                                                    |
| `additionalDenials`       | `[]`               | Dependency policies placed after the invariant denials                                                                                     |
| `policyExternalModules`   | `[]`               | External modules domain and application files may import                                                                                   |
| `policyRestrictedImports` | `[]`               | Further `no-restricted-imports` path entries for domain and application files                                                              |
| `testAccess`              | none               | `{ categories, element? }`: file categories tests may also reach, optionally only in elements matching the `element` selector              |
| `placementFiles`          | `files`            | Files the placement rule checks                                                                                                            |
| `resolverConditions`      | the resolver's own | Export conditions `eslint-import-resolver-typescript` selects, such as a condition that maps workspace packages to their TypeScript source |

`eslint-plugin-boundaries` applies the last matching policy. The preset orders
policies as shared allowances, `additionalAllows`, the invariant denials, then
`additionalDenials`, so an additional allowance can widen what the shared
allowances permit but never override an invariant.

`capabilityFileRules(elements, roleDescriptors)` returns the same file
descriptors the preset uses, for tools that need to classify capability files
the same way.

FSL-1.1-MIT © 2025-2026 AgentXM, Inc.
