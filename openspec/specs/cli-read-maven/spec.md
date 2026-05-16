## ADDED Requirements

### Requirement: Read axm recommendation metadata from local JAR files

The Maven reader SHALL inspect locally cached JAR files for axm recommendation metadata. For each detected maven package, the reader SHALL read the JAR as a zip archive and extract the `META-INF/axm.json` entry. The `META-INF/` directory is the standard Java extensibility mechanism used by ServiceLoader, Spring, Quarkus, and other ecosystem tools.

#### Scenario: JAR with valid META-INF/axm.json

- **WHEN** `~/.m2/repository/com/google/guava/guava/32.1.0-jre/guava-32.1.0-jre.jar` contains `META-INF/axm.json` with `{ "extensions": [{ "ref": "@google/skills/guava", "versionRange": "^1.0.0" }] }`
- **THEN** the reader SHALL return the extension refs `[{ "ref": "@google/skills/guava", "versionRange": "^1.0.0" }]`

#### Scenario: JAR without META-INF/axm.json

- **WHEN** the JAR file does not contain a `META-INF/axm.json` entry
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: JAR with empty extensions

- **WHEN** `META-INF/axm.json` contains `{ "extensions": [] }`
- **THEN** the reader SHALL return an empty array of recommendations

### Requirement: Search Maven local repository for JAR files

The reader SHALL search the Maven local repository at `~/.m2/repository/<groupId-path>/<artifactId>/<version>/` for JAR files. The reader SHALL reconstruct the path from `PackageUrlParts` namespace (groupId with dots converted to path separators) and name (artifactId).

#### Scenario: Standard Maven local repository path

- **WHEN** the detected package has `namespace: "com.google.guava"`, `name: "guava"`, `version: "32.1.0-jre"`
- **THEN** the reader SHALL look for JARs in `~/.m2/repository/com/google/guava/guava/32.1.0-jre/`

#### Scenario: GroupId dots converted to path separators

- **WHEN** the detected package has `namespace: "org.apache.commons"`, `name: "commons-lang3"`, `version: "3.14.0"`
- **THEN** the reader SHALL look for JARs in `~/.m2/repository/org/apache/commons/commons-lang3/3.14.0/`

### Requirement: Search Gradle cache for JAR files

The reader SHALL also check the Gradle cache at `~/.gradle/caches/modules-2/files-2.1/<group>/<name>/<version>/` for JAR files when the Maven local repository does not contain the artifact.

#### Scenario: JAR found in Gradle cache

- **WHEN** `~/.m2/repository/` does not contain the artifact
- **AND** `~/.gradle/caches/modules-2/files-2.1/com.google.guava/guava/32.1.0-jre/` contains a JAR
- **THEN** the reader SHALL read the JAR from the Gradle cache location

#### Scenario: JAR not found in either cache

- **WHEN** neither Maven local repository nor Gradle cache contains the artifact
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

### Requirement: Missing JAR or cache handled gracefully

When the local repository directory, Gradle cache, or the specific JAR file does not exist, the reader SHALL return no recommendations without raising an error. This is the normal case for artifacts not yet downloaded.

#### Scenario: Maven local repository does not exist

- **WHEN** the `~/.m2/repository/` directory does not exist
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Artifact version directory does not exist

- **WHEN** the repository exists but the specific version directory is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

### Requirement: Validate META-INF/axm.json against AxmPackageMeta schema

The reader SHALL validate `axm.json` contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed axm.json warned and skipped

- **WHEN** `META-INF/axm.json` contains `{ "extensions": { "invalid": true } }`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** `META-INF/axm.json` contains `{ "extensions": [{ "ref": "@acme/skills/foo", "versionRange": "^1.0.0" }], "futureField": true }`
- **THEN** the reader SHALL extract `extensions` and ignore unknown fields
