# C++ Conan TinyFlags

This example shows how a Conan C++ recipe can ship companion AXM extensions
for its users. The package is a small C++17 feature-flag library named
`agentxm-example-tinyflags`.

The AXM extensions are published to AgentXM.ai under `@examples`. The Conan
package itself uses the recipe name `agentxm-example-tinyflags`.

The recipe ships AXM recommendations under the `axm:` key in `conandata.yml`,
which Conan exports verbatim into the package cache at
`<conan-cache>/p/agentxm-example-tinyflags/<version>/export/conandata.yml`.

```yaml
axm:
  $schema: "https://axm.sh/schemas/axm-package-meta.schema.json"
  recommendedExtensions:
    - "@examples/packs/cpp-conan-tinyflags@^0.1.0"
```

When this recipe is installed as a dependency, `axm discover` reads the
exported `conandata.yml` and surfaces the companion pack as a package-author
recommendation.

A working consumer is in `../cpp-conan-app/` (the `pawmatch` CLI).

## Layout

```text
.
├── conanfile.py            Conan recipe
├── conandata.yml           Companion-extension recommendations under `axm:`
├── CMakeLists.txt          Build script for the static library + tests
├── include/                Public headers
│   └── agentxm/tinyflags.hpp
├── src/                    Library implementation
│   └── tinyflags.cpp
└── test/                   Catch2 test suite
    └── tinyflags_test.cpp
```

## Build & test

With a working Conan 2.x + CMake toolchain:

```bash
conan create . --build=missing
```

The recipe enables `AGENTXM_TINYFLAGS_BUILD_TESTS=ON` during `conan create`,
so the Catch2 test target is built and executed as part of the recipe's
`build()` step. To build locally without invoking Conan:

```bash
cmake -B build -DAGENTXM_TINYFLAGS_BUILD_TESTS=ON
cmake --build build
ctest --test-dir build --output-on-failure
```

## Library

The library exposes `agentxm::tinyflags::BooleanFlag`,
`agentxm::tinyflags::VariantFlag`, and `agentxm::tinyflags::Registry`:

```cpp
#include <agentxm/tinyflags.hpp>

using namespace agentxm::tinyflags;

Registry flags;
flags.add("checkout-redesign", BooleanFlag::with_default(true));
flags.add(
    "search-ranking",
    VariantFlag::create({"classic", "semantic"})
        .with_default("classic")
        .with_rollout({{"semantic", 100}}));

Context ctx("user-1");
const bool on = flags.enabled("checkout-redesign", ctx);   // true
const auto v  = flags.variant("search-ranking", ctx);      // "semantic"
const auto e  = flags.evaluate("search-ranking", ctx);     // kind=Variant, variant_value="semantic"
```

Bucketing is deterministic per `(flag-name, context-id)` using a 32-bit
FNV-1a hash, so the same caller always receives the same answer across runs
and across ports.

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                   |
| -------- | ----------------------------------------------------- |
| Skill    | `@examples/skills/cpp-conan-tinyflags-add-flag`       |
| Skill    | `@examples/skills/cpp-conan-tinyflags-rollout-review` |
| Skill    | `@examples/skills/cpp-conan-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/cpp-conan-tinyflags-maintainer`  |
| Pack     | `@examples/packs/cpp-conan-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:conan/agentxm-example-tinyflags` as its companion package.

## Scenario

A Conan recipe author can use this layout as a model:

1. Implement the C++ library and its CMake build.
2. Add a `conandata.yml` at the recipe root with an `axm:` key whose value
   matches the `AxmPackageMeta` schema.
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
