## Why

Agent extensions (skills, commands, MCP servers) are often designed for specific libraries or frameworks, but there is no way to express this relationship today. Extension authors cannot declare which packages their extension supports, library authors cannot recommend extensions for their ecosystem, and users have no way to discover extensions relevant to the libraries already in their project. Bridging this gap makes extension discovery contextual and reduces the friction of finding the right tools.

## Jobs to Be Done

### JTBD 1: Discover extensions based on packages in use

**Persona**: User (developer using axm in a project)

A user runs `axm discover` in their project. axm scans their local dependency files, identifies the packages in use, and surfaces two categories of results:

- **(a) Compatible extensions** — extensions whose authors have declared compatibility with detected packages. axm resolves detected purls against the axm registry, which indexes `compatiblePackages` declarations at publish time. Community-contributed: "this extension works well with this package."
- **(b) Recommended extensions** — extensions that a package's own author or maintainer has officially recommended. The CLI inspects locally installed package metadata (e.g., the `"axm"` field in `node_modules/next/package.json`, `[package.metadata.axm]` in a downloaded `.crate`, `x_axm` in a CPAN distribution's `META.json`) to discover recommendations without network access. Stronger trust signal: "the library author themselves suggests this extension."

Both categories appear in discovery results, distinguished by attribution. `axm skills install --preview` and pack browsing also surface this context when available.

Discovery for (a) resolves through the axm registry. For (b), the CLI reads recommendation metadata directly from locally installed packages — no ecosystem registry queries are needed. The axm registry protocol also defines a package-recommendations endpoint so that a future axm remote registry implementation can index ecosystem registries and serve recommendations for packages not yet installed locally.

### JTBD 2: Recommend extensions for a package

**Persona**: Library/framework author (e.g. the Prisma team, the Next.js team)

A library author ships recommendation metadata alongside their package using the ecosystem's idiomatic metadata mechanism (e.g., `"axm"` field in `package.json`, `[package.metadata.axm]` in `Cargo.toml`, `.axm.json` sidecar). When users install the package, axm can read this metadata locally to surface recommendations. This supports JTBD 1b.

### JTBD 3: Define compatible packages for an extension

**Persona**: Extension author (someone publishing a skill, command, or MCP server)

An extension author declares which packages their extension is designed for via a `compatiblePackages` field in their extension manifest. The axm registry indexes this at publish time. This supports JTBD 1a.

## Terminology: Registries

This proposal refers to three distinct registry contexts:

- **Ecosystem registry** — a third-party package registry where libraries are published (npm, PyPI, crates.io, RubyGems.org, Maven Central, NuGet.org, etc.)
- **axm local registry** — the local development registry used for end-to-end testing of axm registry protocols
- **axm remote registry** — the production registry at registry.agentxm.ai that serves extension metadata to all axm users

When "axm registry" appears without qualification, it refers to the axm registry protocol — behavior that applies to both the local and remote registries.

## Package Identification

All three JTBDs use [Package URL (purl, ECMA-427)](https://github.com/package-url/purl-spec) as the universal package identifier — `pkg:<type>/<namespace>/<name>@<version>`. This provides canonical identifiers across ecosystems and interoperability with SBOMs, vulnerability databases, and the CVE Record Format. Version constraints use the companion [VERS spec](https://github.com/package-url/vers-spec).

```
pkg:npm/react                                  # npm package
pkg:npm/%40angular/core                        # scoped npm (@ percent-encoded)
pkg:pypi/django                                # PyPI (lowercased, underscores → dashes)
pkg:maven/org.springframework/spring-boot      # Maven (groupId namespace required)
pkg:cargo/tokio                                # Rust crate
pkg:hex/phoenix                                # Elixir/Gleam/BEAM
pkg:pub/characters                             # Dart/Flutter
pkg:huggingface/meta-llama/Llama-3             # HuggingFace model
```

## Version Matching

### `compatiblePackages` Version Semantics

A versionless purl means "any version of this package." Most extensions work across versions of a package (e.g., a React testing skill works with React broadly, not just React 18.2.0), so versionless is the default and recommended form.

```
pkg:npm/react                                    # any version (recommended default)
pkg:npm/react@vers:npm/>=17.0.0                  # React 17+
pkg:npm/react@vers:npm/>=17.0.0|<20.0.0          # React 17.x through 19.x
pkg:npm/react@18.2.0                             # exactly React 18.2.0 (rare)
```

Version constraints use VERS syntax when specified. Exact versions (without VERS) mean exactly that version only — use VERS ranges for minimum-version or range semantics.

### Detection

`axm discover` parses manifest files (e.g., `package.json`, `Cargo.toml`, `pyproject.toml`) to identify direct dependencies. Lock files are not parsed — manifests provide sufficient package identity for discovery, avoid transitive dependency noise, and reduce parser surface across ecosystems.

When a manifest specifies an exact version, it is included in the detected purl. When a manifest specifies a semver range, the version component is omitted — the axm registry handles matching against versionless purls.

| Source         | Example              | Detected purl            |
| -------------- | -------------------- | ------------------------ |
| `package.json` | `"react": "18.2.0"`  | `pkg:npm/react@18.2.0`   |
| `package.json` | `"react": "^18.2.0"` | `pkg:npm/react`          |
| `Cargo.toml`   | `tokio = "=1.28.0"`  | `pkg:cargo/tokio@1.28.0` |
| `Cargo.toml`   | `tokio = "1"`        | `pkg:cargo/tokio`        |

### axm Registry Matching

The axm registry resolves version matching server-side. The CLI sends detected purls (with versions from lock files when available) and the axm registry returns matching extensions.

| Project detected       | Extension declares                | Match? | Reason                                        |
| ---------------------- | --------------------------------- | ------ | --------------------------------------------- |
| `pkg:npm/react@18.2.0` | `pkg:npm/react`                   | Yes    | Versionless declaration matches any version   |
| `pkg:npm/react`        | `pkg:npm/react@18.0.0`            | Yes    | Versionless detection matches any declaration |
| `pkg:npm/react@18.2.0` | `pkg:npm/react@vers:npm/>=17.0.0` | Yes    | 18.2.0 satisfies >=17.0.0                     |
| `pkg:npm/react@16.8.0` | `pkg:npm/react@vers:npm/>=17.0.0` | No     | 16.8.0 does not satisfy >=17.0.0              |
| `pkg:npm/react@18.2.0` | `pkg:npm/react@18.2.0`            | Yes    | Exact match                                   |
| `pkg:npm/react@18.2.0` | `pkg:npm/react@17.0.0`            | No     | Exact version mismatch                        |

## Supported Ecosystems

Package compatibility involves three mechanisms: **declaration** (extension authors name packages via purl in `compatiblePackages`), **detection** (`axm discover` parses project dependency files into purls for matching), and **local recommendation reading** (the CLI inspects installed package metadata for author-provided extension recommendations). Declaration requires a purl identifier; detection requires a parseable manifest; recommendation reading requires an inspectable installed package format. Ecosystems with all three get the full experience. Ecosystems without a registered purl type use `pkg:generic` with an ecosystem qualifier. Ecosystem-registry-only ecosystems support declaration but not local detection or recommendation reading.

**Tier 1 — Core**

| Purl type  | Ecosystem             | Dependency file(s)                                             | Notes                                                                     |
| ---------- | --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pkg:npm`  | JavaScript/TypeScript | package.json                                                   | Covers npm, Yarn, pnpm, Bun. Name lowercased; scoped `@` percent-encoded. |
| `pkg:pypi` | Python                | requirements.txt, pyproject.toml, setup.py, setup.cfg, Pipfile | Name lowercased; underscores replaced with dashes.                        |

**Tier 2 — Major**

| Purl type    | Ecosystem   | Dependency file(s)                                                       | Notes                                                                       |
| ------------ | ----------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `pkg:golang` | Go          | go.mod                                                                   | Namespace required (module path prefix); lowercased.                        |
| `pkg:cargo`  | Rust        | Cargo.toml                                                               | Name is case-sensitive (unlike most types).                                 |
| `pkg:gem`    | Ruby        | Gemfile, \*.gemspec                                                      | Optional `platform` qualifier (default `ruby`).                             |
| `pkg:maven`  | Java/Kotlin | pom.xml, build.gradle, build.gradle.kts, gradle/libs.versions.toml       | Namespace = groupId (required); name = artifactId. Covers Maven and Gradle. |
| `pkg:nuget`  | .NET        | _.csproj, _.fsproj, \*.vbproj, Directory.Packages.props, packages.config | Name is case-insensitive.                                                   |

**Tier 3 — Extended**

| Purl type       | Ecosystem              | Dependency file(s)                                  | Notes                                                         |
| --------------- | ---------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| `pkg:composer`  | PHP                    | composer.json                                       | Vendor namespace required; lowercased.                        |
| `pkg:swift`     | Swift                  | Package.swift                                       | Namespace = host + org (e.g. `github.com/Alamofire`).         |
| `pkg:hex`       | Elixir/Gleam/BEAM      | mix.exs, gleam.toml                                 | Covers Elixir, Erlang, Gleam. Optional org namespace.         |
| `pkg:pub`       | Dart/Flutter           | pubspec.yaml                                        | Name lowercase, `[a-z0-9_]` only.                             |
| `pkg:docker`    | Docker/OCI             | Dockerfile, docker-compose.yml, docker-compose.yaml | Optional image-registry/org namespace. See also `pkg:oci`.    |
| `pkg:cocoapods` | iOS/macOS              | Podfile, \*.podspec                                 | Subspecs via subpath (e.g. `pkg:cocoapods/ShareKit#Twitter`). |
| `pkg:conda`     | Python ML/Data Science | environment.yml, meta.yaml                          | Has `channel` and `subdir` qualifiers.                        |

**Tier 4 — Specialized**

| Purl type         | Ecosystem                  | Dependency file(s)          | Notes                                                         |
| ----------------- | -------------------------- | --------------------------- | ------------------------------------------------------------- |
| `pkg:conan`       | C/C++                      | conanfile.txt, conanfile.py | Conan package manager.                                        |
| `pkg:cran`        | R                          | DESCRIPTION                 | Statistical computing / data science.                         |
| `pkg:huggingface` | ML models                  | — (ecosystem-registry-only) | Models, datasets, and spaces on huggingface.co.               |
| `pkg:mlflow`      | ML model registry (MLflow) | — (ecosystem-registry-only) | MLflow model registry artifacts.                              |
| `pkg:cpan`        | Perl                       | cpanfile, Makefile.PL       | CPAN ecosystem.                                               |
| `pkg:hackage`     | Haskell                    | \*.cabal, stack.yaml        | Hackage package archive.                                      |
| `pkg:julia`       | Julia                      | Project.toml                | Julia ecosystem package registry.                             |
| `pkg:luarocks`    | Lua                        | \*.rockspec                 | Lua packages; relevant for Neovim plugin ecosystem.           |
| `pkg:oci`         | OCI container images       | — (ecosystem-registry-only) | More general than `docker`; any OCI-compliant image registry. |
| `pkg:opam`        | OCaml                      | \*.opam, dune-project       | OCaml package manager.                                        |
| `pkg:bazel`       | Bazel                      | MODULE.bazel, WORKSPACE     | Bazel build system dependencies.                              |

**Tier 5 — Emerging (no registered purl type)**

| Purl type          | Ecosystem | Dependency file(s)          | Notes                                                                              |
| ------------------ | --------- | --------------------------- | ---------------------------------------------------------------------------------- |
| `pkg:generic/zig`  | Zig       | build.zig.zon               | URL-based dependencies with integrity hashes. No central ecosystem registry yet.   |
| `pkg:generic/jsr`  | Deno/JSR  | deno.json, deno.jsonc       | JSR-native imports (`jsr:@scope/name`). npm imports covered by `pkg:npm`.          |
| `pkg:generic/mojo` | Mojo      | pixi.toml, mojoproject.toml | Early-stage ecosystem from Modular. Deps are conda packages; consider `pkg:conda`. |

## Capabilities

### New Capabilities

- `extension-package-compatibility`: Schema and semantics for `compatiblePackages` in extension manifests using purl strings (JTBD 3), version constraints via VERS, and dependency-file-to-purl mapping for discovery (JTBD 1a)
- `package-recommendations`: Schema for library/framework authors to define recommended extensions (JTBD 2), local installed-package metadata reading for each ecosystem, and surfacing in discovery results (JTBD 1b)
- `cli-discover`: The `axm discover` command (JTBD 1) that detects project dependencies from local manifest files, resolves them to purls, reads locally installed package metadata for recommendations (1b), and queries the axm registry for compatible extensions (1a)
- `registry-package-recommendations-protocol`: axm registry API protocol for querying package recommendations by purl, so that a future axm remote registry implementation can index ecosystem registries and serve recommendations for packages not installed locally. Implemented in the axm local registry.

### Modified Capabilities

- `extension-packs`: Packs may include package-compatibility metadata that aggregates across their contained extensions
- `cli-skills-install`: Preview mode surfaces package-compatibility context when available
- `registry-publish`: axm registry accepts and indexes purl-based compatibility metadata at publish time

## Scope

### Initial scope

- **Local recommendation reading**: The CLI inspects locally installed package metadata for each supported ecosystem to discover author-provided extension recommendations (JTBD 1b). This requires ecosystem-specific readers for installed package formats (e.g., `node_modules/*/package.json`, Python `.dist-info/`, Cargo's `cargo metadata` output, `.axm.json` sidecars).
- **axm registry protocol definition**: The axm registry API protocol for package-recommendations queries is defined and documented, enabling a future axm remote registry implementation to index ecosystem registries.
- **axm local registry implementation**: The axm local registry implements the package-recommendations protocol, enabling end-to-end testing of the full flow.
- **Compatible extensions via axm registry**: The CLI queries the axm registry for compatible extensions (JTBD 1a) using `compatiblePackages` declarations indexed at publish time.

### Deferred

- **axm remote registry indexing**: The axm remote registry (registry.agentxm.ai) indexing of ecosystem registries (npm, PyPI, RubyGems, etc.) for recommendation metadata. When implemented, this will enable recommendations for packages not yet installed locally, using the same protocol already defined and implemented in the axm local registry.

## Impact

- **Extension manifest schema**: New optional `compatiblePackages` field (array of purl strings) added to skill, command, and MCP server manifests
- **axm registry API**: New package-recommendations query protocol; compatible-extensions query by purl; indexing for compatibility metadata at publish time
- **CLI**: New `discover` command with dependency file parsers and installed-package metadata readers for 28 ecosystems; enhanced preview output in install and pack commands
- **Ecosystem files**: Reads local project manifest files to detect direct dependencies and inspects installed package metadata for recommendations (does not modify any files)
- **axm local registry**: Implements the package-recommendations protocol for development and testing
- **Third-party integration point**: Recommendation metadata spec for library authors to include in their published packages
- **Dependencies**: purl parsing/validation library needed (e.g. `packageurl-js`)

---

## Appendix: Recommendation Mechanisms by Ecosystem

This appendix documents how library/framework authors in each ecosystem ship recommendation metadata (JTBD 2) alongside their packages, and how the CLI reads it from locally installed packages. For each ecosystem, the "locally inspectable" property is the primary concern — the CLI reads installed package metadata directly. The "ecosystem-registry-discoverable" property documents whether a future axm remote registry implementation could index recommendations from ecosystem registries without downloading full packages.

### Summary

| Ecosystem     | Recommended mechanism                                                                                                                                                                               | Locally inspectable?                                                                                                        | Ecosystem-registry-discoverable? (deferred)                                                                                        | Precedent                                                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm           | `"axm"` field in package.json                                                                                                                                                                       | Yes (`node_modules/<pkg>/package.json`)                                                                                     | Yes ([registry API](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md), full metadata only)             | Strong ([Jest](https://jestjs.io/docs/configuration), [Babel](https://babeljs.io/docs/configuration), [Prettier](https://prettier.io/docs/en/configuration), [Browserslist](https://browsersl.ist/)) |
| Python        | Entry points + `.axm.json` in package data                                                                                                                                                          | Yes (`.dist-info/entry_points.txt` + package data; no Python required)                                                      | Partial (requires [wheel download](https://packaging.python.org/en/latest/specifications/binary-distribution-format/))             | Strong ([pytest11](https://docs.pytest.org/en/stable/how-to/writing_plugins.html), Flask, Flake8)                                                                                                    |
| Go            | `.axm.json` in module root                                                                                                                                                                          | Yes (`$GOPATH/pkg/mod/<module>@<version>/.axm.json` after `go mod download`)                                                | No (requires [module zip download](https://go.dev/ref/mod#zip-files))                                                              | Weak                                                                                                                                                                                                 |
| Rust          | `[package.metadata.axm]` in Cargo.toml                                                                                                                                                              | Yes (via [`cargo metadata`](https://doc.rust-lang.org/cargo/commands/cargo-metadata.html) JSON output)                      | No (not in [registry index](https://doc.rust-lang.org/cargo/reference/registry-index.html) or [crates.io API](https://crates.io/)) | Strong ([docs.rs](https://docs.rs/about/metadata), cargo-deb, cargo-bundle)                                                                                                                          |
| Ruby          | Gemspec [`metadata`](https://guides.rubygems.org/specification-reference/#metadata) hash                                                                                                            | Yes (`<gem-install-dir>/specifications/<gem>.gemspec`)                                                                      | Yes ([RubyGems.org API](https://guides.rubygems.org/rubygems-org-api/))                                                            | Strong (link URIs, `rubygems_mfa_required`)                                                                                                                                                          |
| Java/Kotlin   | `META-INF/axm.json` in JARs                                                                                                                                                                         | Yes (extract from local `.jar` in `~/.m2/repository/` or Gradle cache)                                                      | No (requires JAR download)                                                                                                         | Very strong ([ServiceLoader](https://docs.oracle.com/javase/8/docs/api/java/util/ServiceLoader.html), Spring, Quarkus)                                                                               |
| .NET          | NuGet tags + `.axm.json` in `.nupkg`                                                                                                                                                                | Yes (`~/.nuget/packages/{id}/{version}/.axm.json` after restore)                                                            | Partial (tags searchable on [NuGet.org](https://learn.microsoft.com/en-us/nuget/nuget-org/search-on-nuget-org))                    | Strong (Roslyn analyzers, [buildTransitive](https://learn.microsoft.com/en-us/nuget/concepts/msbuild-props-and-targets))                                                                             |
| PHP           | [`extra`](https://getcomposer.org/doc/04-schema.md#extra) field in composer.json                                                                                                                    | Yes (`vendor/<pkg>/composer.json`)                                                                                          | Yes ([Packagist API](https://packagist.org/apidoc))                                                                                | Very strong (Laravel, PHPStan, Symfony Flex)                                                                                                                                                         |
| Swift         | `.axm.json` in package repository                                                                                                                                                                   | Yes (`.build/checkouts/<pkg>/.axm.json` after resolution)                                                                   | No (requires repo access)                                                                                                          | Strong ([`.spi.yml`](https://blog.swiftpackageindex.com/posts/the-swift-package-index-metadata-file-first-steps) pattern)                                                                            |
| Elixir        | [`extra`](https://github.com/hexpm/specifications/blob/main/package_metadata.md) field in Hex metadata                                                                                              | Yes (`deps/<pkg>/hex_metadata.config` after `mix deps.get`)                                                                 | Partial (specified but Hex API does not return `extra` in responses)                                                               | Weak (Nerves precedent unverified via Hex API)                                                                                                                                                       |
| Dart/Flutter  | Custom field in [pubspec.yaml](https://dart.dev/tools/pub/pubspec)                                                                                                                                  | Yes (`.dart_tool/package_config.json` → package root → `pubspec.yaml`)                                                      | Partial (pubspec via [pub.dev API](https://github.com/dart-lang/pub/blob/master/doc/repository-spec-v2.md); not searchable)        | Strong (Flutter's `flutter:` key)                                                                                                                                                                    |
| Docker        | OCI annotations + `.axm.json`                                                                                                                                                                       | Partial (annotations on pulled images; `.axm.json` in build context only)                                                   | Partial (annotations in manifest)                                                                                                  | Strong (Sigstore, SLSA)                                                                                                                                                                              |
| CocoaPods     | `.axm.json` via [`preserve_paths`](https://guides.cocoapods.org/syntax/podspec.html#preserve_paths)                                                                                                 | Yes (`Pods/<pkg>/.axm.json` after `pod install`)                                                                            | No (podspec schema is closed)                                                                                                      | Weak (trunk read-only Dec 2026; transitional)                                                                                                                                                        |
| Conda         | [`extra`](https://docs.conda.io/projects/conda-build/en/latest/resources/define-metadata.html#extra-section) section in meta.yaml + `.axm.json`                                                     | Partial (`info/about.json` in package; `.axm.json` via install to `$CONDA_PREFIX/share/axm/`)                               | No (not in channel index)                                                                                                          | Moderate (conda-forge maintainers)                                                                                                                                                                   |
| C/C++ (Conan) | Custom keys in [`conandata.yml`](https://docs.conan.io/2/reference/conandata_yml.html); Conan 2.x also offers [`extension_properties`](https://docs.conan.io/2/reference/conanfile/attributes.html) | Partial (Conan cache structure varies; `conandata.yml` in recipe export)                                                    | No (ConanCenter rejects non-standard keys)                                                                                         | Moderate                                                                                                                                                                                             |
| R (CRAN)      | [`Config/axm`](https://r-pkgs.org/description.html) prefixed DESCRIPTION fields                                                                                                                     | Yes (`<lib-path>/<pkg>/DESCRIPTION` after install)                                                                          | Partial (custom fields not in CRAN PACKAGES index; queryable via [R-universe API](https://docs.r-universe.dev/))                   | Moderate                                                                                                                                                                                             |
| HuggingFace   | Custom YAML frontmatter in [model cards](https://huggingface.co/docs/hub/model-cards)                                                                                                               | Yes (`~/.cache/huggingface/hub/models--<id>/` after download)                                                               | Yes ([Hub API](https://huggingface.co/docs/hub/api))                                                                               | Strong                                                                                                                                                                                               |
| MLflow        | [Model/version tags](https://mlflow.org/docs/latest/model-registry.html)                                                                                                                            | No (instance-local API only; no local file)                                                                                 | Instance-local only                                                                                                                | Moderate                                                                                                                                                                                             |
| Perl (CPAN)   | [`x_`](https://metacpan.org/pod/CPAN::Meta::Spec) prefixed META.json keys                                                                                                                           | Yes (`<lib-path>/.meta/<dist>/MYMETA.json` after install)                                                                   | Partial ([MetaCPAN API](https://metacpan.org/) via Elasticsearch DSL)                                                              | Strong                                                                                                                                                                                               |
| Haskell       | [`x-`](https://cabal.readthedocs.io/en/stable/cabal-package-description-file.html) prefixed .cabal fields                                                                                           | Yes (`.cabal` file in `~/.cabal/store/` or `dist-newstyle/`)                                                                | No (raw file only)                                                                                                                 | Moderate                                                                                                                                                                                             |
| Julia         | Custom [TOML sections](https://pkgdocs.julialang.org/v1/toml-files/) in Project.toml                                                                                                                | Yes (`~/.julia/packages/<pkg>/<hash>/Project.toml`)                                                                         | No (raw file only)                                                                                                                 | Strong ([Preferences.jl](https://github.com/JuliaPackaging/Preferences.jl) relies on custom sections)                                                                                                |
| Lua           | Custom [rockspec](https://github.com/luarocks/luarocks/wiki/Rockspec-format) fields (Lua globals, not formal extension points)                                                                      | Partial (rockspec in LuaRocks tree; requires Lua evaluation)                                                                | No (raw file only)                                                                                                                 | Weak                                                                                                                                                                                                 |
| OCaml         | [`x-`](https://opam.ocaml.org/doc/Manual.html) prefixed .opam fields                                                                                                                                | Yes (`.opam` file in opam switch; queryable via [`opam list --field-match`](https://opam.ocaml.org/doc/man/opam-list.html)) | Partial (raw .opam file in [opam-repository](https://github.com/ocaml/opam-repository))                                            | Moderate                                                                                                                                                                                             |
| Bazel         | `.axm.json` sidecar; [BCR `metadata.json`](https://bazel.build/external/registry) requires approval                                                                                                 | Partial (module cache location varies; `external/<repo>/` in output base)                                                   | No                                                                                                                                 | Low                                                                                                                                                                                                  |
| Zig           | `.axm.json` sidecar ([`build.zig.zon`](https://ziglang.org/documentation/master/) rejects unknown fields)                                                                                           | Yes (`~/.cache/zig/` package cache after fetch)                                                                             | No                                                                                                                                 | None                                                                                                                                                                                                 |
| Deno/JSR      | Custom top-level keys in [`deno.json`](https://docs.deno.com/runtime/fundamentals/configuration/)                                                                                                   | Partial (`$DENO_DIR/` cache; structure varies)                                                                              | No (JSR does not index custom fields)                                                                                              | Weak                                                                                                                                                                                                 |
| Mojo          | `.axm.json` sidecar (`mojoproject.toml` is [deprecated](https://github.com/prefix-dev/pixi/pull/3942); `pixi.toml` does not support `[tool.*]`)                                                     | Partial (pixi cache at `.pixi/envs/`)                                                                                       | No (no registry)                                                                                                                   | Weak                                                                                                                                                                                                 |

### Ecosystem Details

#### npm (JavaScript/TypeScript)

**Inline:** `"axm"` custom field in [package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json). npm explicitly allows arbitrary fields — the npm ecosystem registry preserves and serves them.

**Ecosystem-registry-discoverable:** Yes. The [npm registry API](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md) returns custom fields in the **full metadata** response, so recommendations are queryable without installing the package (`npm view <pkg> axm` or via HTTP). The [abbreviated metadata](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md) response (`Accept: application/vnd.npm.install-v1+json`) does NOT include custom fields. The axm remote registry should use version-specific npm endpoints (`/:package/:version` or `/:package/latest`) to avoid downloading multi-megabyte packuments.

**External file:** Not needed — inline is the primary mechanism.

```json
{
  "name": "next",
  "axm": {
    "recommendedExtensions": ["@vercel/skills/nextjs@^1.0.0", "@vercel/mcp-servers/nextjs@^1.0.0"]
  }
}
```

**Precedent:** [Jest](https://jestjs.io/docs/configuration) (`"jest"`), [Babel](https://babeljs.io/docs/configuration) (`"babel"`), [Prettier](https://prettier.io/docs/en/configuration) (`"prettier"`), [Browserslist](https://browsersl.ist/) (`"browserslist"`). ESLint historically used `"eslintConfig"` ([removed in v10](https://eslint.org/blog/2026/02/eslint-v10.0.0-released/); migration was driven by needing JS-level config features, not a rejection of the pattern). [Nx](https://nx.dev/) uses a hybrid pattern where `"generators"` in package.json points to a standalone `generators.json` file.

**Covers:** npm, Yarn, pnpm, Bun — all preserve arbitrary package.json fields. Yarn and pnpm additionally offer consumer-side [`packageExtensions`](https://yarnpkg.com/configuration/yarnrc#packageExtensions) for patching dependency metadata.

**Detection notes:** Dependencies using `npm:` aliases (e.g., `"lodash-es": "npm:lodash@^4.17.0"`) should map to the **real** package name (`pkg:npm/lodash`), not the alias. Dependencies using `file:`, `link:`, `workspace:`, `git:`, and URL-based specifiers are skipped (not ecosystem-registry-hosted packages). `peerDependencies` indicate framework relationships relevant to discovery and should be considered for detection.

#### Python (PyPI)

**Inline:** Not viable. `[tool.*]` sections in [pyproject.toml](https://packaging.python.org/en/latest/specifications/pyproject-toml/) do not survive installation and are not exposed by [PyPI's API](https://docs.pypi.org/api/json/). The core metadata spec does not support arbitrary extension fields.

**Ecosystem-registry-discoverable:** Partial. Entry points are NOT available through the [PyPI JSON API](https://docs.pypi.org/api/json/) or [Simple API (PEP 658)](https://peps.python.org/pep-0658/). To read entry points, the axm remote registry must **download the wheel** from PyPI and extract `entry_points.txt` from `.dist-info/` (it's a zip archive). Both `entry_points.txt` (INI format) and `.axm.json` (JSON) are parseable without running Python. The [entry points specification](https://packaging.python.org/en/latest/specifications/entry-points/) defines the format; [PEP 621](https://peps.python.org/pep-0621/) governs declaring them in pyproject.toml.

**External file:** `.axm.json` as package data, discovered by convention alongside an entry point marker.

```toml
[project.entry-points."axm"]
my_package = "my_package._axm"
```

Entry point values must be valid Python object references (module or `module:object` form). A value like `"my_package:.axm.json"` is **invalid** per the [entry points spec](https://packaging.python.org/en/latest/specifications/entry-points/) because `.axm.json` is not a valid Python identifier. Instead, use the entry point as a **presence marker** (like `pytest11` plugins reference a module) and ship `.axm.json` as package data discovered by convention. The axm remote registry detects the `[axm]` entry point group in the wheel's `entry_points.txt`, then locates `.axm.json` from the package data in the same wheel.

**Precedent:** [pytest plugins](https://docs.pytest.org/en/stable/how-to/writing_plugins.html) (`pytest11` group), [Flask extensions](https://flask.palletsprojects.com/en/stable/extensions/) (`flask.commands`), [Flake8 plugins](https://flake8.pycqa.org/en/latest/plugin-development/) (`flake8.extension`), [Sphinx](https://www.sphinx-doc.org/) themes. The [py.typed](https://peps.python.org/pep-0561/) marker file validates the standalone-file-in-package pattern.

#### Go

**Inline:** Not viable. `go.mod` has a [fixed grammar](https://go.dev/ref/mod#go-mod-file-syntax) — unrecognized directives cause parse errors.

**Ecosystem-registry-discoverable:** No. The [GOPROXY protocol](https://go.dev/ref/mod#goproxy-protocol) serves `go.mod` individually via the `.mod` endpoint but no other files — `.axm.json` requires downloading the full zip.

**External file:** `.axm.json` in module root. Shipped in the [module zip](https://pkg.go.dev/golang.org/x/mod/zip). After `go mod download`, files land at `$GOPATH/pkg/mod/<module>@<version>/`.

**Precedent:** No established convention for tool metadata files in Go modules. `LICENSE`, `README.md`, and `.goreleaser.yml` are common non-Go files shipped in module roots. `.goreleaser.yml` is the closest analog (a tool-specific config file shipped in the module root) but serves build configuration rather than discovery.

**Detection notes:** The `pkg:golang` purl type has known spec issues: lowercasing [loses case information](https://github.com/package-url/purl-spec/issues/308) needed for module paths like `github.com/MyOrg/FooBar`, and v2+ module path splitting (e.g., `github.com/russross/blackfriday/v2`) creates [namespace/name ambiguity](https://github.com/package-url/purl-spec/issues/63). Detection should use `require` directive module paths (ignoring `replace` targets) and filter out `// indirect` dependencies.

#### Rust

**Inline:** [`[package.metadata.axm]`](https://doc.rust-lang.org/cargo/reference/manifest.html#the-metadata-table) table in Cargo.toml. Cargo explicitly reserves `[package.metadata]` for external tools — no warnings, fully preserved in published `.crate` files, and accessible via [`cargo metadata`](https://doc.rust-lang.org/cargo/commands/cargo-metadata.html) (JSON output).

**Ecosystem-registry-discoverable:** No. Neither the [crates.io ecosystem registry index](https://doc.rust-lang.org/cargo/reference/registry-index.html) nor the [crates.io API](https://crates.io/api/v1/crates/tokio) exposes `[package.metadata]`. Discovery requires downloading the `.crate` archive.

**External file:** Not needed — inline is the primary mechanism.

```toml
[package.metadata.axm]
recommendedExtensions = ["@my-org/skills/tokio-debug@^1.0.0"]
```

**Precedent:** [docs.rs](https://docs.rs/about/metadata) (`[package.metadata.docs.rs]`), [cargo-deb](https://github.com/kornelski/cargo-deb) (`[package.metadata.deb]`), [cargo-bundle](https://github.com/nickelc/cargo-bundle) (`[package.metadata.bundle]`), [wasm-pack](https://rustwasm.github.io/docs/wasm-pack/) (`[package.metadata.wasm-pack]`).

#### Ruby

**Inline:** Gemspec [`metadata`](https://guides.rubygems.org/specification-reference/#metadata) hash. A first-class feature (since RubyGems 2.0) preserved in the gem. Keys max 128 bytes, values max 1024 bytes, strings only — complex data must be serialized compactly. The 1024-byte value limit practically caps recommendations at roughly 10-15 extension references per key depending on name length.

**Ecosystem-registry-discoverable:** Yes. The [RubyGems.org API](https://guides.rubygems.org/rubygems-org-api/) (`/api/v1/gems/{name}.json`) serves custom metadata keys. Recommendations are queryable over HTTP without downloading the gem.

**External file:** Not needed — inline is the primary mechanism.

```ruby
s.metadata = {
  "axm_recommendedExtensions" => '["@rails/skills/activerecord@^1.0"]'
}
```

**Precedent:** `source_code_uri`, `changelog_uri`, `rubygems_mfa_required` — all consumed by RubyGems.org. The API exposes custom keys alongside recognized ones.

#### Java/Kotlin (Maven/Gradle)

**Inline:** POM [`<properties>`](https://maven.apache.org/pom.html#properties) can carry lightweight signals (e.g., `<axm.extensions>true</axm.extensions>`). Raw POMs are fetchable via HTTPS from Maven Central (`https://repo1.maven.org/maven2/...`; [HTTP was deprecated January 2020](https://central.sonatype.org/news/20190405_http_deprecation_notice/)). POM `<properties>` survive deployment intact (they are valid POM schema elements), but they are not indexed by [Maven Central's search API](https://central.sonatype.org/search/rest-api-guide/) — so they serve as a supplementary signal rather than the primary mechanism.

**Ecosystem-registry-discoverable:** Partial. POM properties are fetchable (requires downloading and parsing the POM XML) but not searchable via API.

**External file:** `META-INF/axm.json` in JARs. [`META-INF/`](https://docs.oracle.com/javase/8/docs/api/java/util/ServiceLoader.html) files follow decades of JVM precedent for embedded metadata. Gradle publishes to Maven repos using the same JAR format.

**Precedent:** [Java ServiceLoader](https://docs.oracle.com/javase/8/docs/api/java/util/ServiceLoader.html) (`META-INF/services/`), [Spring Boot auto-configuration](https://docs.spring.io/spring-boot/reference/using/auto-configuration.html) (`META-INF/spring/`), [Quarkus extension metadata](https://quarkus.io/guides/building-my-first-extension) (`META-INF/quarkus-extension.properties`). Gradle's [Module Metadata](https://docs.gradle.org/current/userguide/publishing_gradle_module_metadata.html) (`.module` files) supports typed attributes but is Gradle-only.

#### .NET (NuGet)

**Inline:** Not viable for structured data. The [`.nuspec` schema](https://learn.microsoft.com/en-us/nuget/reference/nuspec) is closed — custom elements under `<metadata>` are stripped during NuGet processing. `<tags>` (space-delimited strings, max 4,000 chars) serve as a lightweight discovery signal — an `axm` tag indicates the package ships recommendation data.

**Ecosystem-registry-discoverable:** Partial. Tags are indexed and [searchable on NuGet.org](https://learn.microsoft.com/en-us/nuget/nuget-org/search-on-nuget-org). Structured data requires downloading the `.nupkg`.

**External file:** `.axm.json` included in the [`.nupkg`](https://learn.microsoft.com/en-us/nuget/reference/nuspec#including-content-files), accessible from the NuGet cache (`~/.nuget/packages/{id}/{version}/`).

**Precedent:** [Roslyn analyzers](https://learn.microsoft.com/en-us/visualstudio/code-quality/roslyn-analyzers-overview) (`analyzers/` directory), [Source Link](https://learn.microsoft.com/en-us/dotnet/standard/library-guidance/sourcelink), [Package README](https://learn.microsoft.com/en-us/nuget/nuget-org/package-readme-on-nuget-org) (`<readme>`).

#### PHP (Composer)

**Inline:** [`extra`](https://getcomposer.org/doc/04-schema.md#extra) field in composer.json. Accepts arbitrary JSON — the dominant tool-to-tool metadata mechanism in PHP.

**Ecosystem-registry-discoverable:** Yes. The [Packagist API](https://packagist.org/apidoc) includes `extra` in version metadata responses, enabling remote discovery.

**External file:** Not needed — inline is the primary mechanism.

```json
{
  "extra": {
    "axm": {
      "recommendedExtensions": ["@laravel/skills/eloquent@^1.0"]
    }
  }
}
```

**Precedent:** [Laravel Package Auto-Discovery](https://laravel.com/docs/master/packages#package-discovery) (`extra.laravel.providers`), [PHPStan Extension Installer](https://github.com/phpstan/extension-installer) (`extra.phpstan.includes`), [Symfony Flex](https://symfony.com/doc/current/setup/flex.html) (`extra.symfony`).

#### Swift (SPM)

**Inline:** Not viable. [`Package.swift`](https://docs.swift.org/package-manager/PackageDescription/PackageDescription.html) has a fixed initializer with no extension point for custom metadata — a [Swift Forums proposal](https://forums.swift.org/t/extend-swiftpm-packagedescription-to-introduce-metadata/37722) was not accepted.

**Ecosystem-registry-discoverable:** No. Requires repo access. [SE-0292](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0292-package-registry-service.md) (Package Registry Service) defines metadata publishing but the schema is not designed for arbitrary extensions.

**External file:** `.axm.json` in package repository root.

**Precedent:** [`.spi.yml`](https://blog.swiftpackageindex.com/posts/the-swift-package-index-metadata-file-first-steps) — the Swift Package Index's metadata file is widely adopted and has a [validator tool](https://swiftpackageindex.com/ValidateSPIManifest/documentation/validatespimanifest).

**Detection notes:** `Package.swift` is executable Swift code, not a static manifest. Reliable detection requires `swift package dump-package` (which outputs a JSON representation), creating a runtime dependency on the Swift toolchain.

#### Elixir/Gleam/BEAM (Hex)

**Inline:** [`extra`](https://github.com/hexpm/specifications/blob/main/package_metadata.md) field in Hex package metadata. Defined as an optional key-value list in the specification, but not documented in user-facing [Hex publishing guides](https://hex.pm/docs/publish) or [`mix hex.publish`](https://hexdocs.pm/hex/Mix.Tasks.Hex.Publish.html) documentation.

**Ecosystem-registry-discoverable:** Partial. The [Hex API specification](https://github.com/hexpm/specifications/blob/main/apiary.apib) documents `extra:` search syntax, but the Hex HTTP API does not return `extra` in release or package responses. Discovery requires downloading the package tarball and reading `metadata.config` (Erlang term format).

**External file:** Consider `.axm.json` sidecar in the package's `files` list as the primary mechanism, given the undocumented nature of `extra` in publishing workflows.

```elixir
defp package do
  [extra: %{"axm" => %{"recommendedExtensions" => ["@phoenix/skills/liveview"]}}]
end
```

**Precedent:** The [Nerves project](https://nerves-project.org/) uses `nerves_package` configuration in `mix.exs` for package metadata (not the Hex `extra` field as previously stated). Hex `extra` usage in the wild is extremely rare.

**Dependency files:** `mix.exs` for Elixir projects; `gleam.toml` for [Gleam](https://gleam.run/writing-gleam/gleam-toml/) projects (both publish to Hex and use `pkg:hex`).

#### Dart/Flutter (pub.dev)

**Inline:** Custom field in [pubspec.yaml](https://dart.dev/tools/pub/pubspec). The spec explicitly permits custom fields: "give it a unique name that won't clash with future pubspec fields." The pub tool ignores unrecognized fields.

**Ecosystem-registry-discoverable:** Partial. The [pub.dev Hosted Repository Spec V2](https://github.com/dart-lang/pub/blob/master/doc/repository-spec-v2.md) returns the full pubspec as a JSON object in API responses, so custom fields like `axm:` are accessible without downloading the package archive. However, pub.dev does not offer search/filter capabilities on custom fields.

**External file:** Not needed — inline is the primary mechanism. The axm remote registry can read custom fields from the pub.dev ecosystem registry API without downloading tarballs.

```yaml
axm:
  recommendedExtensions:
    - "@flutter/skills/widget-helper@^1.0"
```

**Precedent:** Flutter's own [`flutter:` key](https://docs.flutter.dev/tools/pubspec) for plugin platforms, assets, and fonts is the canonical example of tool-specific metadata in pubspec.yaml.

#### Docker/OCI

**Inline:** [OCI annotations](https://github.com/opencontainers/image-spec/blob/main/annotations.md) on image manifests. String-to-string maps; custom annotations outside the `org.opencontainers` namespace are explicitly permitted. [Dockerfile `LABEL`](https://docs.docker.com/reference/dockerfile/#label) instructions also carry key-value metadata, but require fetching the image config blob (vs. just the manifest for annotations).

**Ecosystem-registry-discoverable:** Partial. Annotations are accessible from [OCI distribution APIs](https://github.com/opencontainers/distribution-spec) without pulling image layers, but limited to flat key-value strings.

**External file:** `.axm.json` in the repository or build context for structured data.

**Precedent:** [Sigstore/cosign](https://docs.sigstore.dev/) attestation annotations, [SLSA provenance](https://slsa.dev/), [Label Schema](https://label-schema.org/) (deprecated but widely used).

**Detection notes:** The [purl spec recommends](https://github.com/package-url/purl-spec/blob/main/types-doc/oci-definition.md) `pkg:oci` over `pkg:docker` for new usage. `FROM ${VARIABLE}` without a default value is unparseable at static analysis time and should be skipped with a diagnostic.

#### CocoaPods

**Inline:** Not viable. The [podspec DSL](https://guides.cocoapods.org/syntax/podspec.html) has no extensibility mechanism — custom keys are rejected by `pod lib lint`. The [CocoaPods Specs repo](https://github.com/CocoaPods/Specs) and trunk API have a closed schema.

**Ecosystem-registry-discoverable:** No.

**External file:** `.axm.json` shipped via [`preserve_paths`](https://guides.cocoapods.org/syntax/podspec.html#preserve_paths), which prevents CocoaPods from deleting it during installation.

**Note:** CocoaPods trunk becomes read-only on [December 2, 2026](https://kitemetric.com/blogs/cocoapods-sunset-migrate-to-swift-package-manager-now) — no new pods or updates after that date. The ecosystem is actively migrating to [Swift Package Manager](https://www.swift.org/documentation/package-manager/). CocoaPods support should be considered transitional.

#### Conda

**Inline:** [`extra`](https://docs.conda.io/projects/conda-build/en/latest/resources/define-metadata.html#extra-section) section in meta.yaml. Documented as "a schema-free area for storing non-conda-specific metadata." The `extra` section IS preserved in the built package's `info/about.json` (since [conda-build PR #3048](https://github.com/conda/conda-build/issues/3046)), but is NOT included in `index.json` or `repodata.json` (the channel index).

**Ecosystem-registry-discoverable:** No. `extra` is accessible only after downloading the package (`info/about.json`); it is not in the channel index.

**Detection notes:** `pip:` sub-list items in `environment.yml` are PyPI packages and should map to `pkg:pypi`, not `pkg:conda`.

**External file:** `.axm.json` installed to `$CONDA_PREFIX/share/axm/` for post-install discovery.

**Precedent:** [conda-forge](https://conda-forge.org/) stores `recipe-maintainers` in `extra`. Jupyter extensions install metadata to `$CONDA_PREFIX/share/jupyter/`.

#### Tier 4+5 Ecosystems

**C/C++ (Conan):** Inline: custom keys in [`conandata.yml`](https://docs.conan.io/2/reference/conandata_yml.html) work for private repos, but [ConanCenter](https://conan.io/center) rejects non-standard keys. Conan 2.x also offers [`extension_properties`](https://docs.conan.io/2/reference/conanfile/attributes.html) on `conanfile.py` and experimental [`recipe_metadata_folder`/`package_metadata_folder`](https://docs.conan.io/2/devops/metadata.html) for arbitrary metadata files. Ecosystem-registry-discoverable: no. External file: `.axm.json` sidecar.

**R (CRAN):** Inline: [`Config/axm`](https://r-pkgs.org/description.html) prefixed fields in DESCRIPTION (the `Config/` prefix is the [recommended convention](https://r-pkgs.org/description.html); `X-` is not officially documented). Ecosystem-registry-discoverable: partial — custom fields are not in CRAN's standard [PACKAGES index](https://stat.ethz.ch/R-manual/R-devel/library/utils/html/available.packages.html) but are queryable via [R-universe API](https://docs.r-universe.dev/) or custom repositories. External file: `.axm.json` in `inst/` as fallback.

**HuggingFace:** Inline: custom YAML frontmatter in [model cards](https://huggingface.co/docs/hub/model-cards) is fully supported. Ecosystem-registry-discoverable: yes, via the [Hub API](https://huggingface.co/docs/hub/api). External file: not needed.

**MLflow:** Inline: [model/version tags](https://mlflow.org/docs/latest/model-registry.html) (key-value strings). Ecosystem-registry-discoverable: instance-local only. External file: not applicable.

**Perl (CPAN):** Inline: [`x_`](https://metacpan.org/pod/CPAN::Meta::Spec) prefixed keys in META.json are formally specified extension fields (consumers MAY ignore them). Ecosystem-registry-discoverable: partial — stored in [MetaCPAN](https://metacpan.org/)'s Elasticsearch backing store and queryable via [Elasticsearch DSL](https://github.com/metacpan/metacpan-api/blob/master/docs/API-docs.md), but not surfaced in standard search. Only [`x_contributors` and `x_chat`](https://metacpan.org/about/metadata) are explicitly recognized. External file: not needed. Note: the `pkg:cpan` purl type requires the [PAUSE author ID](https://pause.perl.org/) as namespace and uses distribution names (not module names with `::`).

**Haskell (Hackage):** Inline: [`x-`](https://cabal.readthedocs.io/en/stable/cabal-package-description-file.html) prefixed .cabal fields are preserved. Ecosystem-registry-discoverable: no (raw file only). External file: `.axm.json` sidecar as alternative.

**Julia:** Inline: custom TOML sections in [Project.toml](https://pkgdocs.julialang.org/v1/toml-files/) are ignored by Pkg but preserved (verified in [Pkg.jl source](https://github.com/JuliaLang/Pkg.jl/blob/master/src/project.jl); relied upon by [Preferences.jl](https://github.com/JuliaPackaging/Preferences.jl)). Ecosystem-registry-discoverable: no (raw file only). External file: `.axm.json` sidecar as alternative.

**Lua (LuaRocks):** Inline: custom fields in [rockspec](https://github.com/luarocks/luarocks/wiki/Rockspec-format) files are technically global variable assignments in Lua (not formal extension points) and are ignored by LuaRocks at runtime, but there is no guarantee they will remain tolerated across versions. Parsing requires a Lua interpreter. Ecosystem-registry-discoverable: no. External file: `.axm.json` sidecar (recommended primary mechanism).

**OCaml (opam):** Inline: [`x-`](https://opam.ocaml.org/doc/Manual.html) prefixed fields are first-class extension fields, preserved but not surfaced by default in `opam show`. Ecosystem-registry-discoverable: partial — `x-` fields are preserved in [opam-repository](https://github.com/ocaml/opam-repository) raw `.opam` files and queryable locally via [`opam list --field-match`](https://opam.ocaml.org/doc/man/opam-list.html), but not via any web API. External file: `.axm.json` sidecar as alternative.

**Bazel:** Inline: not viable. [`MODULE.bazel`](https://bazel.build/rules/lib/globals/module) has no extension fields. [BCR `metadata.json`](https://bazel.build/external/registry) requires maintainer approval. Ecosystem-registry-discoverable: no. External file: `.axm.json` sidecar. The primary dependency file is `MODULE.bazel` (Bzlmod); `BUILD` files declare build targets, not external dependencies. `WORKSPACE` is the legacy mechanism.

**Zig:** Inline: not viable. [`build.zig.zon`](https://ziglang.org/documentation/master/) is a strict Zig struct literal — unrecognized fields cause compile errors. Ecosystem-registry-discoverable: no. External file: `.axm.json` sidecar.

**Deno/JSR:** Inline: [`deno.json`](https://docs.deno.com/runtime/fundamentals/configuration/) tolerates unknown **top-level** keys (nested custom keys in sections like `lint` or `fmt` will error; see [denoland/deno#18970](https://github.com/denoland/deno/issues/18970)). Ecosystem-registry-discoverable: no — [JSR](https://jsr.io/docs/package-configuration) does not index custom fields. External file: `.axm.json` sidecar as fallback.

**Mojo:** `mojoproject.toml` is [deprecated](https://github.com/prefix-dev/pixi/pull/3942) (legacy format for Modular's Magic tool). New Mojo projects use [`pixi.toml`](https://docs.modular.com/pixi/) for configuration. `pixi.toml` does not document a `[tool.*]` section. Ecosystem-registry-discoverable: no (no ecosystem registry). External file: `.axm.json` sidecar (only viable mechanism). Mojo dependencies are conda packages from `conda.modular.com` or `conda-forge` — consider using `pkg:conda` instead of `pkg:generic/mojo`.
