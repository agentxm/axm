## ADDED Requirements

### Requirement: Parse build.zig.zon for Zig dependencies

The Zig detector SHALL parse `build.zig.zon` in the project directory and extract entries from the `.dependencies` field. Zig Object Notation (Zon) uses a struct-like syntax. Each dependency SHALL be converted to a native `pkg:zig` purl. Dependency names are the keys; URLs provide identity.

#### Scenario: Dependencies extracted from build.zig.zon

- **WHEN** `build.zig.zon` contains `.dependencies` with entries `"zap"` and `"mach"` pointing to URL-based sources
- **THEN** the detector SHALL produce `pkg:zig/zap` and `pkg:zig/mach` purls

#### Scenario: Missing build.zig.zon

- **WHEN** the project directory does not contain a `build.zig.zon` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed build.zig.zon

- **WHEN** `build.zig.zon` contains invalid Zon syntax
- **THEN** the detector SHALL log a warning and return an empty array

#### Scenario: No dependencies field

- **WHEN** `build.zig.zon` exists but contains no `.dependencies` field
- **THEN** the detector SHALL return an empty array

### Requirement: Package identity derived from dependency name

Since Zig has no central ecosystem registry, the detector SHALL derive package identity from the dependency name key in `build.zig.zon`. The purl SHALL use the `pkg:zig` type with the dependency name.

#### Scenario: Dependency name used as purl name

- **WHEN** `.dependencies` contains a key `"ziglyph"` with a URL source
- **THEN** the detector SHALL produce a purl with `type: "zig"`, `name: "ziglyph"`

### Requirement: URL-based dependencies with integrity hashes

Zig dependencies use URL-based sources with integrity hashes. The detector SHALL extract dependencies regardless of their URL source. The URL and hash provide reproducibility but are not part of the purl.

#### Scenario: Dependency with URL and hash

- **WHEN** `.dependencies` contains `"zap": .{ .url = "https://github.com/...", .hash = "..." }`
- **THEN** the detector SHALL produce a purl for `zap` without encoding the URL or hash in the purl
