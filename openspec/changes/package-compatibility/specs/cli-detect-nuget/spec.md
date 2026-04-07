## ADDED Requirements

### Requirement: Parse .NET project files for NuGet package references

The NuGet detector SHALL parse `*.csproj`, `*.fsproj`, and `*.vbproj` files in the project directory and extract `<PackageReference>` elements as `pkg:nuget` purls. Package names SHALL be lowercased in the purl since NuGet names are case-insensitive.

#### Scenario: PackageReference from csproj

- **WHEN** a `.csproj` file contains `<PackageReference Include="Newtonsoft.Json" Version="13.0.3" />`
- **THEN** the detector SHALL produce a purl with `type: "nuget"`, `name: "newtonsoft.json"`

#### Scenario: PackageReference from fsproj

- **WHEN** a `.fsproj` file contains `<PackageReference Include="FSharp.Core" Version="8.0.0" />`
- **THEN** the detector SHALL produce a purl with `type: "nuget"`, `name: "fsharp.core"`

#### Scenario: PackageReference from vbproj

- **WHEN** a `.vbproj` file contains `<PackageReference Include="Microsoft.VisualBasic" Version="10.3.0" />`
- **THEN** the detector SHALL produce a purl with `type: "nuget"`, `name: "microsoft.visualbasic"`

#### Scenario: PackageReference without version

- **WHEN** a `.csproj` file contains `<PackageReference Include="Newtonsoft.Json" />`
- **THEN** the detector SHALL produce `pkg:nuget/newtonsoft.json` (versionless)

#### Scenario: Missing project files

- **WHEN** the project directory does not contain any `.csproj`, `.fsproj`, or `.vbproj` files
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed project file

- **WHEN** a `.csproj` file contains invalid XML
- **THEN** the detector SHALL log a warning and return an empty array from that file

### Requirement: Parse Directory.Packages.props for central package management

The NuGet detector SHALL parse `Directory.Packages.props` and extract `<PackageVersion>` elements as `pkg:nuget` purls. This file is used for .NET central package management where versions are defined centrally.

#### Scenario: PackageVersion from Directory.Packages.props

- **WHEN** `Directory.Packages.props` contains `<PackageVersion Include="Newtonsoft.Json" Version="13.0.3" />`
- **THEN** the detector SHALL produce a purl with `type: "nuget"`, `name: "newtonsoft.json"`

#### Scenario: Missing Directory.Packages.props

- **WHEN** the project directory does not contain `Directory.Packages.props`
- **THEN** the detector SHALL return an empty array from central package management parsing
- **AND** no error SHALL be raised

### Requirement: Parse legacy packages.config

The NuGet detector SHALL parse `packages.config` files and extract `<package>` elements as `pkg:nuget` purls.

#### Scenario: Package from packages.config

- **WHEN** `packages.config` contains `<package id="Newtonsoft.Json" version="13.0.3" />`
- **THEN** the detector SHALL produce a purl with `type: "nuget"`, `name: "newtonsoft.json"`

#### Scenario: Missing packages.config

- **WHEN** the project directory does not contain `packages.config`
- **THEN** the detector SHALL return an empty array from packages.config parsing
- **AND** no error SHALL be raised

### Requirement: Case-insensitive name normalization

NuGet package names are case-insensitive. The detector SHALL lowercase all package names in the purl to ensure consistent matching.

#### Scenario: Mixed case normalized

- **WHEN** a `.csproj` file contains `<PackageReference Include="Newtonsoft.Json" Version="13.0.3" />`
- **THEN** the detector SHALL produce `pkg:nuget/newtonsoft.json@13.0.3`

#### Scenario: All uppercase normalized

- **WHEN** a `.csproj` file contains `<PackageReference Include="AWSSDK.S3" Version="3.7.0" />`
- **THEN** the detector SHALL produce `pkg:nuget/awssdk.s3@3.7.0`

### Requirement: Exact versions produce versioned purls

Exact version strings SHALL produce versioned purls. NuGet version ranges (e.g., `[1.0,2.0)`, `(,1.0]`) SHALL produce versionless purls.

#### Scenario: Exact version

- **WHEN** a `<PackageReference>` specifies `Version="13.0.3"`
- **THEN** the detector SHALL produce `pkg:nuget/newtonsoft.json@13.0.3`

#### Scenario: Version range produces versionless purl

- **WHEN** a `<PackageReference>` specifies `Version="[1.0,2.0)"`
- **THEN** the detector SHALL produce a versionless purl

#### Scenario: Floating version produces versionless purl

- **WHEN** a `<PackageReference>` specifies `Version="1.0.*"`
- **THEN** the detector SHALL produce a versionless purl

### Requirement: Deduplication across project files

When multiple project files or package management files declare the same package, the detector SHALL produce only one purl for that package.

#### Scenario: Duplicate across csproj and Directory.Packages.props

- **WHEN** both a `.csproj` file and `Directory.Packages.props` declare `Newtonsoft.Json`
- **THEN** the detector SHALL produce only one purl for `newtonsoft.json`

#### Scenario: Duplicate across csproj and packages.config

- **WHEN** both a `.csproj` file and `packages.config` declare `Newtonsoft.Json`
- **THEN** the detector SHALL produce only one purl for `newtonsoft.json`
