## Why

Agent extensions (skills, commands, MCP servers) are often designed for specific libraries or frameworks, but there is no way to express this relationship today. Extension authors cannot declare which packages their extension supports, library authors cannot recommend extensions for their ecosystem, and users have no way to discover extensions relevant to the libraries already in their project. Bridging this gap makes extension discovery contextual and reduces the friction of finding the right tools.

## Jobs to Be Done

### JTBD 1: Discover extensions based on packages in use

**Persona**: User (developer using axm in a project)

A user runs `axm discover` in their project. axm scans their dependency files, identifies the packages in use, and surfaces two categories of results:

- **(a) Compatible extensions** — extensions whose authors have declared compatibility with detected packages. Community-contributed: "this extension works well with this package."
- **(b) Recommended extensions** — extensions that a package's own author or maintainer has officially recommended. Stronger trust signal: "the library author themselves suggests this extension."

Both categories appear in discovery results, distinguished by attribution. `axm skills install --preview` and pack browsing also surface this context when available.

### JTBD 2: Recommend extensions for a package

**Persona**: Library/framework author (e.g. the Prisma team, the Next.js team)

A library author ships a recommendations manifest alongside their package to surface their recommended extensions to axm users. This supports JTBD 1b.

### JTBD 3: Define compatible packages for an extension

**Persona**: Extension author (someone publishing a skill, command, or MCP server)

An extension author declares which packages their extension is designed for via a `compatiblePackages` field in their extension manifest. The registry indexes this at publish time. This supports JTBD 1a.

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

## Supported Ecosystems

Package compatibility involves two mechanisms: **declaration** (extension authors name packages via purl in `compatiblePackages`) and **discovery** (`axm discover` parses project dependency files into purls for matching). Declaration requires a purl identifier; discovery requires a parseable manifest. Ecosystems with both get the full experience. Ecosystems without a registered purl type use `pkg:generic` with an ecosystem qualifier. Registry-only ecosystems support declaration but not local discovery.

**Tier 1 — Core**

| Purl type  | Ecosystem             | Dependency file(s)                                             | Notes                                                                     |
| ---------- | --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pkg:npm`  | JavaScript/TypeScript | package.json, package-lock.json, yarn.lock, pnpm-lock.yaml     | Covers npm, Yarn, pnpm, Bun. Name lowercased; scoped `@` percent-encoded. |
| `pkg:pypi` | Python                | requirements.txt, pyproject.toml, setup.py, setup.cfg, Pipfile | Name lowercased; underscores replaced with dashes.                        |

**Tier 2 — Major**

| Purl type    | Ecosystem   | Dependency file(s)                                                       | Notes                                                                       |
| ------------ | ----------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `pkg:golang` | Go          | go.mod, go.sum                                                           | Namespace required (module path prefix); lowercased.                        |
| `pkg:cargo`  | Rust        | Cargo.toml, Cargo.lock                                                   | Name is case-sensitive (unlike most types).                                 |
| `pkg:gem`    | Ruby        | Gemfile, \*.gemspec, Gemfile.lock                                        | Optional `platform` qualifier (default `ruby`).                             |
| `pkg:maven`  | Java/Kotlin | pom.xml, build.gradle, build.gradle.kts                                  | Namespace = groupId (required); name = artifactId. Covers Maven and Gradle. |
| `pkg:nuget`  | .NET        | _.csproj, _.fsproj, \*.vbproj, Directory.Packages.props, packages.config | Name is case-insensitive.                                                   |

**Tier 3 — Extended**

| Purl type       | Ecosystem              | Dependency file(s)                                  | Notes                                                         |
| --------------- | ---------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| `pkg:composer`  | PHP                    | composer.json, composer.lock                        | Vendor namespace required; lowercased.                        |
| `pkg:swift`     | Swift                  | Package.swift, Package.resolved                     | Namespace = host + org (e.g. `github.com/Alamofire`).         |
| `pkg:hex`       | Elixir/Gleam/BEAM      | mix.exs, mix.lock                                   | Covers Elixir, Erlang, Gleam. Optional org namespace.         |
| `pkg:pub`       | Dart/Flutter           | pubspec.yaml, pubspec.lock                          | Name lowercase, `[a-z0-9_]` only.                             |
| `pkg:docker`    | Docker/OCI             | Dockerfile, docker-compose.yml, docker-compose.yaml | Optional registry/org namespace. See also `pkg:oci`.          |
| `pkg:cocoapods` | iOS/macOS              | Podfile, Podfile.lock, \*.podspec                   | Subspecs via subpath (e.g. `pkg:cocoapods/ShareKit#Twitter`). |
| `pkg:conda`     | Python ML/Data Science | environment.yml, meta.yaml                          | Has `channel` and `subdir` qualifiers.                        |

**Tier 4 — Specialized**

| Purl type         | Ecosystem            | Dependency file(s)          | Notes                                                   |
| ----------------- | -------------------- | --------------------------- | ------------------------------------------------------- |
| `pkg:conan`       | C/C++                | conanfile.txt, conanfile.py | Conan package manager.                                  |
| `pkg:cran`        | R                    | DESCRIPTION, renv.lock      | Statistical computing / data science.                   |
| `pkg:huggingface` | ML models            | — (registry-only)           | Models, datasets, and spaces on huggingface.co.         |
| `pkg:mlflow`      | ML model registry    | — (registry-only)           | MLflow model registry artifacts.                        |
| `pkg:cpan`        | Perl                 | cpanfile, Makefile.PL       | CPAN ecosystem.                                         |
| `pkg:hackage`     | Haskell              | \*.cabal, stack.yaml        | Hackage package archive.                                |
| `pkg:julia`       | Julia                | Project.toml                | Julia package registry.                                 |
| `pkg:luarocks`    | Lua                  | \*.rockspec                 | Lua packages; relevant for Neovim plugin ecosystem.     |
| `pkg:oci`         | OCI container images | — (registry-only)           | More general than `docker`; any OCI-compliant registry. |
| `pkg:opam`        | OCaml                | \*.opam, dune-project       | OCaml package manager.                                  |
| `pkg:bazel`       | Bazel                | BUILD, WORKSPACE            | Bazel build system dependencies.                        |

**Tier 5 — Emerging (no registered purl type)**

| Purl type          | Ecosystem | Dependency file(s)    | Notes                                                                     |
| ------------------ | --------- | --------------------- | ------------------------------------------------------------------------- |
| `pkg:generic/zig`  | Zig       | build.zig.zon         | URL-based dependencies with integrity hashes. No central registry yet.    |
| `pkg:generic/jsr`  | Deno/JSR  | deno.json, deno.jsonc | JSR-native imports (`jsr:@scope/name`). npm imports covered by `pkg:npm`. |
| `pkg:generic/mojo` | Mojo      | mojoproject.toml      | Early-stage ecosystem from Modular.                                       |

## Capabilities

### New Capabilities

- `extension-package-compatibility`: Schema and semantics for `compatiblePackages` in extension manifests using purl strings (JTBD 3), version constraints via VERS, and dependency-file-to-purl mapping for discovery (JTBD 1a)
- `package-recommendations`: Schema for library/framework authors to define recommended extensions (JTBD 2), manifest discovery, trust/provenance model, and surfacing in discovery results (JTBD 1b)
- `cli-discover`: The `axm discover` command (JTBD 1) that detects project dependencies, resolves them to purls, and presents both compatible (1a) and recommended (1b) extensions

### Modified Capabilities

- `extension-packs`: Packs may include package-compatibility metadata that aggregates across their contained extensions
- `cli-skills-install`: Preview mode surfaces package-compatibility context when available
- `registry-publish`: Registry accepts and indexes purl-based compatibility and recommendations metadata at publish time

## Impact

- **Extension manifest schema**: New optional `compatiblePackages` field (array of purl strings) added to skill, command, and MCP server manifests
- **Registry API**: New query capabilities for purl-based discovery; indexing for compatibility and recommendations metadata
- **CLI**: New `discover` command with dependency file parsers for 28 ecosystems; enhanced preview output in install and pack commands
- **Ecosystem files**: Reads but does not modify project dependency files across all supported ecosystems
- **Third-party integration point**: Recommendation manifest spec for library authors to include in their published packages
- **Dependencies**: purl parsing/validation library needed (e.g. `packageurl-js`)

---

## Appendix: Recommendation Mechanisms by Ecosystem

This appendix documents how library/framework authors in each ecosystem could ship recommendation metadata (JTBD 2) alongside their packages, including the most viable mechanism, precedent, and trade-offs.

### Summary

| Ecosystem     | Recommended mechanism                                                                                                                              | Registry-discoverable?                                                                                                  | Precedent                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| npm           | `"axm"` field in package.json                                                                                                                      | Yes ([registry API](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md))                      | Strong (ESLint, Jest, Babel, Prettier)                                                                                    |
| Python        | Entry points + standalone file in site-packages                                                                                                    | Yes (parse `.dist-info/entry_points.txt`)                                                                               | Strong ([pytest11](https://docs.pytest.org/en/stable/how-to/writing_plugins.html), Flask, Flake8)                         |
| Go            | Standalone file in module root                                                                                                                     | No (requires [module zip download](https://go.dev/ref/mod#zip-files))                                                   | Weak                                                                                                                      |
| Rust          | `[package.metadata.axm]` in Cargo.toml                                                                                                             | No (requires `.crate` download; not in [registry index](https://doc.rust-lang.org/cargo/reference/registry-index.html)) | Strong ([docs.rs](https://docs.rs/about/metadata), cargo-deb, cargo-bundle)                                               |
| Ruby          | Gemspec [`metadata`](https://guides.rubygems.org/specification-reference/#metadata) hash                                                           | Yes ([RubyGems.org API](https://guides.rubygems.org/rubygems-org-api/))                                                 | Strong (link URIs, `rubygems_mfa_required`)                                                                               |
| Java/Kotlin   | POM [`<properties>`](https://maven.apache.org/pom.html#properties) + `META-INF/axm/extensions.json`                                                | Partial (POM fetchable from Central)                                                                                    | Very strong ([ServiceLoader](https://docs.oracle.com/javase/8/docs/api/java/util/ServiceLoader.html), Spring, Quarkus)    |
| .NET          | NuGet tags + file at conventional path in `.nupkg`                                                                                                 | Partial (tags searchable on [NuGet.org](https://learn.microsoft.com/en-us/nuget/nuget-org/search-on-nuget-org))         | Strong (Roslyn analyzers, [buildTransitive](https://learn.microsoft.com/en-us/nuget/concepts/msbuild-props-and-targets))  |
| PHP           | [`extra`](https://getcomposer.org/doc/04-schema.md#extra) field in composer.json                                                                   | Yes ([Packagist API](https://packagist.org/apidoc))                                                                     | Very strong (Laravel, PHPStan, Symfony Flex)                                                                              |
| Swift         | Standalone file (`.axm-recommendations.json`)                                                                                                      | No (requires repo access)                                                                                               | Strong ([`.spi.yml`](https://blog.swiftpackageindex.com/posts/the-swift-package-index-metadata-file-first-steps) pattern) |
| Elixir        | [`extra`](https://github.com/hexpm/specifications/blob/main/package_metadata.md) field in Hex metadata                                             | Yes ([Hex API supports `extra` search](https://github.com/hexpm/specifications/blob/main/apiary.apib))                  | Moderate (Nerves)                                                                                                         |
| Dart/Flutter  | Custom field in [pubspec.yaml](https://dart.dev/tools/pub/pubspec)                                                                                 | No (pub.dev ignores custom fields)                                                                                      | Strong (Flutter's `flutter:` key)                                                                                         |
| Docker        | [OCI annotations](https://github.com/opencontainers/image-spec/blob/main/annotations.md) + standalone file                                         | Partial (annotations in manifest)                                                                                       | Strong (Sigstore, SLSA)                                                                                                   |
| CocoaPods     | Standalone file via [`preserve_paths`](https://guides.cocoapods.org/syntax/podspec.html#preserve_paths)                                            | No (podspec schema is closed)                                                                                           | Weak                                                                                                                      |
| Conda         | [`extra`](https://docs.conda.io/projects/conda-build/en/latest/resources/define-metadata.html#extra-section) section in meta.yaml + installed file | No (not in built package metadata)                                                                                      | Moderate (conda-forge maintainers)                                                                                        |
| C/C++ (Conan) | Custom keys in [`conandata.yml`](https://docs.conan.io/2/reference/conandata_yml.html)                                                             | No (ConanCenter rejects non-standard keys)                                                                              | Moderate                                                                                                                  |
| R (CRAN)      | [`X-`](https://cran.r-project.org/doc/manuals/R-exts.html#The-DESCRIPTION-file) prefixed DESCRIPTION fields                                        | Yes (queryable via `available.packages()`)                                                                              | Strong                                                                                                                    |
| HuggingFace   | Custom YAML frontmatter in [model cards](https://huggingface.co/docs/hub/model-cards)                                                              | Yes ([Hub API](https://huggingface.co/docs/hub/api))                                                                    | Strong                                                                                                                    |
| MLflow        | [Model/version tags](https://mlflow.org/docs/latest/model-registry.html)                                                                           | Instance-local only                                                                                                     | Moderate                                                                                                                  |
| Perl (CPAN)   | [`x_`](https://metacpan.org/pod/CPAN::Meta::Spec) prefixed META.json keys                                                                          | Yes ([MetaCPAN API](https://metacpan.org/))                                                                             | Strong                                                                                                                    |
| Haskell       | [`x-`](https://cabal.readthedocs.io/en/stable/cabal-package-description-file.html) prefixed .cabal fields                                          | No (raw file only)                                                                                                      | Moderate                                                                                                                  |
| Julia         | Custom [TOML sections](https://pkgdocs.julialang.org/v1/toml-files/) in Project.toml                                                               | No (raw file only)                                                                                                      | Moderate                                                                                                                  |
| Lua           | Custom [rockspec](https://github.com/luarocks/luarocks/wiki/Rockspec-format) fields                                                                | No (raw file only)                                                                                                      | Weak                                                                                                                      |
| OCaml         | [`x-`](https://opam.ocaml.org/doc/Manual.html) prefixed .opam fields                                                                               | No (raw file only)                                                                                                      | Moderate                                                                                                                  |
| Bazel         | Sidecar file; [BCR `metadata.json`](https://bazel.build/external/registry) requires approval                                                       | No                                                                                                                      | Low                                                                                                                       |
| Zig           | Sidecar file only ([`build.zig.zon`](https://ziglang.org/documentation/master/) rejects unknown fields)                                            | No                                                                                                                      | None                                                                                                                      |
| Deno/JSR      | Custom keys in [`deno.json`](https://docs.deno.com/runtime/fundamentals/configuration/)                                                            | No (JSR may not index)                                                                                                  | Weak                                                                                                                      |
| Mojo          | `[tool.axm]` in [mojoproject.toml](https://docs.modular.com/mojo/manual/) (pixi convention)                                                        | No (no registry)                                                                                                        | Weak                                                                                                                      |

### Ecosystem Details

#### npm (JavaScript/TypeScript)

**Mechanism:** `"axm"` custom field in [package.json](https://docs.npmjs.com/cli/v10/configuring-npm/package-json).

npm explicitly allows arbitrary fields — the registry preserves and serves them. The [npm registry API](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md) returns custom fields, so recommendations are queryable without installing the package (`npm view <pkg> axm` or via HTTP).

```json
{
  "name": "next",
  "axm": {
    "recommendations": ["@vercel/skills/nextjs@^1.0.0", "@vercel/mcp-servers/nextjs@^1.0.0"]
  }
}
```

**Precedent:** [ESLint](https://eslint.org/docs/latest/use/configure/) (`"eslintConfig"`), [Jest](https://jestjs.io/docs/configuration) (`"jest"`), [Babel](https://babeljs.io/docs/configuration) (`"babel"`), [Prettier](https://prettier.io/docs/en/configuration) (`"prettier"`), [Browserslist](https://browsersl.ist/) (`"browserslist"`). [Nx](https://nx.dev/) uses a hybrid pattern where `"generators"` in package.json points to a standalone `generators.json` file.

**Covers:** npm, Yarn, pnpm, Bun — all preserve arbitrary package.json fields. Yarn and pnpm additionally offer consumer-side [`packageExtensions`](https://yarnpkg.com/configuration/yarnrc#packageExtensions) for patching dependency metadata.

#### Python (PyPI)

**Mechanism:** [Entry points](https://packaging.python.org/en/latest/specifications/entry-points/) for discovery + standalone manifest file for data.

Python's entry point system ([PEP 517](https://peps.python.org/pep-0517/)/[518](https://peps.python.org/pep-0518/)) is the standard plugin-discovery mechanism. A package declares an entry point group in [pyproject.toml](https://packaging.python.org/en/latest/specifications/pyproject-toml/) and the metadata survives installation into `.dist-info/entry_points.txt` — parseable without running Python.

```toml
[project.entry-points."axm.recommendations"]
my-package = "my_package:axm_recommendations"
```

axm scans `site-packages/*/.dist-info/entry_points.txt` for the `[axm.recommendations]` group, then reads the referenced manifest file from the package directory.

**Precedent:** [pytest plugins](https://docs.pytest.org/en/stable/how-to/writing_plugins.html) (`pytest11` group), [Flask extensions](https://flask.palletsprojects.com/en/stable/extensions/) (`flask.commands`), [Flake8 plugins](https://flake8.pycqa.org/en/latest/plugin-development/) (`flake8.extension`), [Sphinx](https://www.sphinx-doc.org/) themes. The [py.typed](https://peps.python.org/pep-0561/) marker file validates the standalone-file-in-package pattern.

**Note:** [pyproject.toml `[tool.*]`](https://peps.python.org/pep-0518/) sections do not survive installation (source artifact only). Entry points + package data files are the mechanisms that persist into installed packages.

#### Go

**Mechanism:** Standalone file in module root (e.g., `axm-recommendations.json`).

Go's [module system](https://go.dev/ref/mod) is intentionally closed — `go.mod` has a [fixed grammar](https://go.dev/ref/mod#go-mod-file-syntax) and unrecognized directives cause parse errors. The only viable approach is shipping a file in the [module zip](https://pkg.go.dev/golang.org/x/mod/zip). After `go mod download`, files land at `$GOPATH/pkg/mod/<module>@<version>/`.

The [GOPROXY protocol](https://go.dev/ref/mod#goproxy-protocol) serves module zips but has no endpoint for individual files — the full zip must be downloaded to read the file.

**Precedent:** No established convention for tool metadata files in Go modules. `LICENSE`, `README.md`, and `.goreleaser.yml` are common non-Go files shipped in module roots.

#### Rust

**Mechanism:** [`[package.metadata.axm]`](https://doc.rust-lang.org/cargo/reference/manifest.html#the-metadata-table) table in Cargo.toml.

Cargo explicitly reserves `[package.metadata]` for external tools — no warnings, fully preserved in published `.crate` files, and accessible via [`cargo metadata`](https://doc.rust-lang.org/cargo/commands/cargo-metadata.html) (JSON output). The [crates.io registry index](https://doc.rust-lang.org/cargo/reference/registry-index.html) does not include `[package.metadata]`, so discovery requires having the crate locally or downloading the `.crate` archive.

```toml
[package.metadata.axm]
recommendations = ["@my-org/skills/tokio-debug@^1.0.0"]
```

**Precedent:** [docs.rs](https://docs.rs/about/metadata) (`[package.metadata.docs.rs]`), [cargo-deb](https://github.com/kornelski/cargo-deb) (`[package.metadata.deb]`), [cargo-bundle](https://github.com/nickelc/cargo-bundle) (`[package.metadata.bundle]`), [wasm-pack](https://rustwasm.github.io/docs/wasm-pack/) (`[package.metadata.wasm-pack]`).

#### Ruby

**Mechanism:** Gemspec [`metadata`](https://guides.rubygems.org/specification-reference/#metadata) hash.

Ruby has the strongest story of any ecosystem. The gemspec `metadata` hash is a first-class feature (since RubyGems 2.0) that is both preserved in the gem and served by the [RubyGems.org API](https://guides.rubygems.org/rubygems-org-api/) (`/api/v1/gems/{name}.json`). Recommendations are queryable over HTTP without downloading the gem.

```ruby
s.metadata = {
  "axm_recommendations" => '["@rails/skills/activerecord@^1.0"]'
}
```

**Constraints:** Keys max 128 bytes, values max 1024 bytes, strings only. Complex data must be serialized compactly.

**Precedent:** `source_code_uri`, `changelog_uri`, `rubygems_mfa_required` — all consumed by RubyGems.org. The API exposes custom keys alongside recognized ones.

#### Java/Kotlin (Maven/Gradle)

**Mechanism:** POM [`<properties>`](https://maven.apache.org/pom.html#properties) for lightweight signaling + `META-INF/axm/extensions.json` in JARs for structured data.

POM properties (`<axm.extensions>...`) are preserved verbatim on [Maven Central](https://repo1.maven.org/maven2/) and fetchable via HTTP. For full structured metadata, [`META-INF/`](https://docs.oracle.com/javase/8/docs/api/java/util/ServiceLoader.html) files in JARs follow decades of JVM precedent. Gradle publishes to Maven repos using the same POM; custom properties are set via [`pom { properties.set(...) }`](https://docs.gradle.org/current/userguide/publishing_maven.html#sec:modifying_the_generated_pom).

**Precedent:** [Java ServiceLoader](https://docs.oracle.com/javase/8/docs/api/java/util/ServiceLoader.html) (`META-INF/services/`), [Spring Boot auto-configuration](https://docs.spring.io/spring-boot/reference/using/auto-configuration.html) (`META-INF/spring/`), [Quarkus extension metadata](https://quarkus.io/guides/building-my-first-extension) (`META-INF/quarkus-extension.properties`). Gradle's [Module Metadata](https://docs.gradle.org/current/userguide/publishing_gradle_module_metadata.html) (`.module` files) supports typed attributes but is Gradle-only.

#### .NET (NuGet)

**Mechanism:** [Package tags](https://learn.microsoft.com/en-us/nuget/reference/nuspec#metadata) for NuGet.org discoverability + file at conventional path in `.nupkg`.

The [`.nuspec` schema](https://learn.microsoft.com/en-us/nuget/reference/nuspec) is closed (no custom elements under `<metadata>`), but `<tags>` are indexed and [searchable on NuGet.org](https://learn.microsoft.com/en-us/nuget/nuget-org/search-on-nuget-org). For structured data, a file at a conventional path (e.g., `axm/extensions.json`) in the [`.nupkg`](https://learn.microsoft.com/en-us/nuget/reference/nuspec#including-content-files) is accessible from the NuGet cache (`~/.nuget/packages/{id}/{version}/`). For deeper integration, [`buildTransitive/`](https://learn.microsoft.com/en-us/nuget/concepts/msbuild-props-and-targets) `.props` files auto-import into consuming projects.

**Precedent:** [Roslyn analyzers](https://learn.microsoft.com/en-us/visualstudio/code-quality/roslyn-analyzers-overview) (`analyzers/` directory), [Source Link](https://learn.microsoft.com/en-us/dotnet/standard/library-guidance/sourcelink), [Package README](https://learn.microsoft.com/en-us/nuget/nuget-org/package-readme-on-nuget-org) (`<readme>`).

#### PHP (Composer)

**Mechanism:** [`extra`](https://getcomposer.org/doc/04-schema.md#extra) field in composer.json.

Composer's `extra` field accepts arbitrary JSON and is the dominant tool-to-tool metadata mechanism in PHP. The [Packagist API](https://packagist.org/apidoc) includes `extra` in version metadata responses, enabling remote discovery.

```json
{
  "extra": {
    "axm": {
      "recommendations": ["@laravel/skills/eloquent@^1.0"]
    }
  }
}
```

**Precedent:** [Laravel Package Auto-Discovery](https://laravel.com/docs/master/packages#package-discovery) (`extra.laravel.providers`), [PHPStan Extension Installer](https://github.com/phpstan/extension-installer) (`extra.phpstan.includes`), [Symfony Flex](https://symfony.com/doc/current/setup/flex.html) (`extra.symfony`).

#### Swift (SPM)

**Mechanism:** Standalone file (`.axm-recommendations.json`) in package repository.

[`Package.swift`](https://docs.swift.org/package-manager/PackageDescription/PackageDescription.html) has a fixed initializer with no extension point for custom metadata — a [Swift Forums proposal](https://forums.swift.org/t/extend-swiftpm-packagedescription-to-introduce-metadata/37722) to add metadata was not accepted. The community converged on standalone files. [SE-0292](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0292-package-registry-service.md) (Package Registry Service) defines metadata publishing but the schema is not designed for arbitrary extensions.

**Precedent:** [`.spi.yml`](https://blog.swiftpackageindex.com/posts/the-swift-package-index-metadata-file-first-steps) — the Swift Package Index's metadata file is widely adopted and has a [validator tool](https://swiftpackageindex.com/ValidateSPIManifest/documentation/validatespimanifest).

#### Elixir/Gleam/BEAM (Hex)

**Mechanism:** [`extra`](https://github.com/hexpm/specifications/blob/main/package_metadata.md) field in Hex package metadata.

The [Hex specification](https://github.com/hexpm/specifications/blob/main/package_metadata.md) defines `extra` as an optional key-value list. Critically, the [Hex API supports searching on `extra`](https://github.com/hexpm/specifications/blob/main/apiary.apib) — `extra:axm,recommendations` would match packages with axm metadata.

```elixir
defp package do
  [extra: %{"axm" => %{"recommendations" => ["@phoenix/skills/liveview"]}}]
end
```

**Precedent:** The [Nerves project](https://nerves-project.org/) uses `extra: %{"type" => "nerves"}` to tag packages.

#### Dart/Flutter (pub.dev)

**Mechanism:** Custom field in [pubspec.yaml](https://dart.dev/tools/pub/pubspec).

The Dart pubspec spec explicitly permits custom fields: "give it a unique name that won't clash with future pubspec fields." The pub tool ignores unrecognized fields. [pub.dev](https://pub.dev/) does not index custom fields.

```yaml
axm:
  recommendations:
    - "@flutter/skills/widget-helper@^1.0"
```

**Precedent:** Flutter's own [`flutter:` key](https://docs.flutter.dev/tools/pubspec) for plugin platforms, assets, and fonts is the canonical example of tool-specific metadata in pubspec.yaml.

#### Docker/OCI

**Mechanism:** [OCI annotations](https://github.com/opencontainers/image-spec/blob/main/annotations.md) on image manifests + standalone file.

OCI annotations are string-to-string maps on manifests, accessible from [registry APIs](https://github.com/opencontainers/distribution-spec) without pulling image layers. Custom annotations outside the `org.opencontainers` namespace are explicitly permitted. For richer data, a standalone file in the repository or build context.

[Dockerfile `LABEL`](https://docs.docker.com/reference/dockerfile/#label) instructions also carry key-value metadata, but require fetching the image config blob (vs. just the manifest for annotations).

**Precedent:** [Sigstore/cosign](https://docs.sigstore.dev/) attestation annotations, [SLSA provenance](https://slsa.dev/), [Label Schema](https://label-schema.org/) (deprecated but widely used).

#### CocoaPods

**Mechanism:** Standalone file via [`preserve_paths`](https://guides.cocoapods.org/syntax/podspec.html#preserve_paths).

The [podspec DSL](https://guides.cocoapods.org/syntax/podspec.html) has no extensibility mechanism — custom keys are rejected by `pod lib lint`. The [CocoaPods Specs repo](https://github.com/CocoaPods/Specs) and trunk API have a closed schema. The only viable path is shipping a file via `preserve_paths`, which prevents CocoaPods from deleting it during installation.

**Note:** CocoaPods has low maintenance activity; [Swift Package Manager](https://www.swift.org/documentation/package-manager/) is increasingly preferred for Apple platforms.

#### Conda

**Mechanism:** [`extra`](https://docs.conda.io/projects/conda-build/en/latest/resources/define-metadata.html#extra-section) section in meta.yaml + installed file at `$CONDA_PREFIX/share/axm/`.

The `extra` section is documented as "a schema-free area for storing non-conda-specific metadata." However, `extra` is a build-time recipe artifact — it is not preserved in the built conda package's `index.json`. For post-install discovery, shipping a file to a conventional path (`$CONDA_PREFIX/share/axm/recommendations.json`) follows the [Jupyter extension](https://jupyter.readthedocs.io/) pattern.

**Precedent:** [conda-forge](https://conda-forge.org/) stores `recipe-maintainers` in `extra`. Jupyter extensions install metadata to `$CONDA_PREFIX/share/jupyter/`.

#### Tier 4+5 Ecosystems

**C/C++ (Conan):** Custom keys in [`conandata.yml`](https://docs.conan.io/2/reference/conandata_yml.html) work for private repos, but [ConanCenter](https://conan.io/center) rejects non-standard keys.

**R (CRAN):** [`X-`](https://cran.r-project.org/doc/manuals/R-exts.html#The-DESCRIPTION-file) prefixed fields in DESCRIPTION are first-class and queryable via `available.packages()`.

**HuggingFace:** Custom YAML frontmatter in [model cards](https://huggingface.co/docs/hub/model-cards) is fully supported and accessible via the [Hub API](https://huggingface.co/docs/hub/api).

**MLflow:** [Model/version tags](https://mlflow.org/docs/latest/model-registry.html) (key-value strings) are the extensibility mechanism, but instance-local only.

**Perl (CPAN):** [`x_`](https://metacpan.org/pod/CPAN::Meta::Spec) prefixed keys in META.json are first-class and indexed by [MetaCPAN](https://metacpan.org/).

**Haskell (Hackage):** [`x-`](https://cabal.readthedocs.io/en/stable/cabal-package-description-file.html) prefixed .cabal fields are preserved but not exposed via Hackage API.

**Julia:** Custom TOML sections in [Project.toml](https://pkgdocs.julialang.org/v1/toml-files/) are ignored by Pkg but preserved in the file.

**Lua (LuaRocks):** Custom fields in [rockspec](https://github.com/luarocks/luarocks/wiki/Rockspec-format) files are ignored by LuaRocks. Parsing requires a Lua interpreter (rockspecs are executable Lua).

**OCaml (opam):** [`x-`](https://opam.ocaml.org/doc/Manual.html) prefixed fields are first-class extension fields, preserved but not surfaced by default in `opam show`.

**Bazel:** [BCR `metadata.json`](https://bazel.build/external/registry) is the closest metadata mechanism but requires BCR maintainer approval. [`MODULE.bazel`](https://bazel.build/rules/lib/globals/module) has no extension fields.

**Zig:** [`build.zig.zon`](https://ziglang.org/documentation/master/) is a strict Zig struct literal — unrecognized fields cause compile errors. Sidecar file is the only option.

**Deno/JSR:** [`deno.json`](https://docs.deno.com/runtime/fundamentals/configuration/) tolerates unknown keys. [JSR](https://jsr.io/docs/package-configuration) may not index them.

**Mojo:** [`mojoproject.toml`](https://docs.modular.com/mojo/manual/) follows the [pixi](https://pixi.sh/latest/reference/pixi_manifest/) convention, likely supporting `[tool.*]` sections.
