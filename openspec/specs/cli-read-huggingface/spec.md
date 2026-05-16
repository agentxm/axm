## ADDED Requirements

### Requirement: Read axm recommendation metadata from cached HuggingFace models

The HuggingFace reader SHALL inspect model card README.md files in the HuggingFace cache at `~/.cache/huggingface/hub/models--<id>/` for YAML frontmatter containing an `axm` key. The reader SHALL transform the `models--<namespace>--<name>` directory format to match purl parts. No HuggingFace CLI dependency is required; the reader operates on the filesystem only.

#### Scenario: Model with valid axm frontmatter

- **WHEN** `~/.cache/huggingface/hub/models--meta-llama--Llama-2-7b/snapshots/<hash>/README.md` contains YAML frontmatter with `axm: { extensions: [{ "ref": "@huggingface/skills/llama", "versionRange": "^1.0.0" }] }`
- **THEN** the reader SHALL return the extension refs `[{ "ref": "@huggingface/skills/llama", "versionRange": "^1.0.0" }]`

#### Scenario: Model without axm frontmatter

- **WHEN** the model card README.md contains YAML frontmatter without an `axm` key
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Model card without YAML frontmatter

- **WHEN** the model card README.md does not contain YAML frontmatter
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Directory name transformed to purl parts

- **WHEN** the model is cached at `models--meta-llama--Llama-2-7b`
- **THEN** the reader SHALL interpret `meta-llama` as the namespace and `Llama-2-7b` as the name

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the `axm` frontmatter contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed axm frontmatter warned and skipped

- **WHEN** the model card contains `axm: "not-an-object"` in its YAML frontmatter
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** the model card contains `axm: { extensions: [{ "ref": "@acme/skills/foo", "versionRange": "^1.0.0" }], futureField: true }` in its YAML frontmatter
- **THEN** the reader SHALL extract `extensions` and ignore unknown fields

### Requirement: Missing HuggingFace cache handled gracefully

When the HuggingFace cache directory does not exist or the specific model directory is absent, the reader SHALL return no recommendations without raising an error. This is the normal case for systems without cached HuggingFace models.

#### Scenario: HuggingFace cache does not exist

- **WHEN** `~/.cache/huggingface/hub/` does not exist
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Model directory absent from cache

- **WHEN** the HuggingFace cache exists but the specific model directory is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised
