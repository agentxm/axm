## ADDED Requirements

### Requirement: Parse pom.xml for Maven dependencies

The Maven detector SHALL parse `pom.xml` in the project directory and extract `<dependency>` elements as `pkg:maven` purls. The purl namespace SHALL be the `<groupId>` and the name SHALL be the `<artifactId>`.

#### Scenario: Standard Maven dependency

- **WHEN** `pom.xml` contains `<dependency><groupId>org.springframework</groupId><artifactId>spring-core</artifactId><version>6.1.0</version></dependency>`
- **THEN** the detector SHALL produce a purl with `type: "maven"`, `namespace: "org.springframework"`, `name: "spring-core"`

#### Scenario: Dependency without version

- **WHEN** `pom.xml` contains `<dependency><groupId>org.slf4j</groupId><artifactId>slf4j-api</artifactId></dependency>`
- **THEN** the detector SHALL produce `pkg:maven/org.slf4j/slf4j-api` (versionless)

#### Scenario: Test-scoped dependency included by default

- **WHEN** `pom.xml` contains `<dependency><groupId>junit</groupId><artifactId>junit</artifactId><version>4.13.2</version><scope>test</scope></dependency>`
- **THEN** the detector SHALL produce a purl for `junit`

#### Scenario: Missing pom.xml

- **WHEN** the project directory does not contain a `pom.xml` file
- **THEN** the detector SHALL return an empty array from pom.xml parsing
- **AND** no error SHALL be raised

#### Scenario: Malformed pom.xml

- **WHEN** `pom.xml` contains invalid XML
- **THEN** the detector SHALL log a warning and return an empty array from pom.xml parsing

### Requirement: Parse Gradle build files for dependencies

The Maven detector SHALL parse `build.gradle` and `build.gradle.kts` files in the project directory and extract dependency declarations in `group:name:version` string format from `implementation`, `api`, `compileOnly`, `runtimeOnly`, and `testImplementation` configurations as `pkg:maven` purls.

#### Scenario: Implementation dependency in build.gradle

- **WHEN** `build.gradle` contains `implementation 'org.springframework:spring-core:6.1.0'`
- **THEN** the detector SHALL produce a purl with `type: "maven"`, `namespace: "org.springframework"`, `name: "spring-core"`

#### Scenario: Kotlin DSL dependency in build.gradle.kts

- **WHEN** `build.gradle.kts` contains `implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.0")`
- **THEN** the detector SHALL produce a purl with `type: "maven"`, `namespace: "org.jetbrains.kotlin"`, `name: "kotlin-stdlib"`

#### Scenario: Multiple configuration types

- **WHEN** `build.gradle` contains `api 'com.google.guava:guava:32.0.0-jre'` and `testImplementation 'org.mockito:mockito-core:5.0.0'`
- **THEN** the detector SHALL produce purls for both `guava` and `mockito-core`

#### Scenario: Dependency without version

- **WHEN** `build.gradle` contains `implementation 'org.springframework:spring-core'`
- **THEN** the detector SHALL produce `pkg:maven/org.springframework/spring-core` (versionless)

#### Scenario: Missing Gradle build files

- **WHEN** the project directory contains no `build.gradle` or `build.gradle.kts` files
- **THEN** the detector SHALL return an empty array from Gradle parsing
- **AND** no error SHALL be raised

### Requirement: Parse Gradle version catalog

The Maven detector SHALL parse `gradle/libs.versions.toml` and extract library entries from the `[libraries]` section as `pkg:maven` purls. Libraries MAY use either `module = "group:name"` or separate `group` and `name` keys.

#### Scenario: Module shorthand syntax

- **WHEN** `gradle/libs.versions.toml` contains `[libraries]` with `spring-core = { module = "org.springframework:spring-core", version = "6.1.0" }`
- **THEN** the detector SHALL produce a purl with `type: "maven"`, `namespace: "org.springframework"`, `name: "spring-core"`

#### Scenario: Separate group and name keys

- **WHEN** `gradle/libs.versions.toml` contains `[libraries]` with `guava = { group = "com.google.guava", name = "guava", version = "32.0.0-jre" }`
- **THEN** the detector SHALL produce a purl with `type: "maven"`, `namespace: "com.google.guava"`, `name: "guava"`

#### Scenario: Version reference

- **WHEN** `gradle/libs.versions.toml` contains `[versions] spring = "6.1.0"` and `[libraries] spring-core = { module = "org.springframework:spring-core", version.ref = "spring" }`
- **THEN** the detector SHALL produce `pkg:maven/org.springframework/spring-core@6.1.0`

#### Scenario: Missing version catalog

- **WHEN** the project directory does not contain `gradle/libs.versions.toml`
- **THEN** the detector SHALL return an empty array from version catalog parsing
- **AND** no error SHALL be raised

### Requirement: Property references in pom.xml

When a `<version>` element in pom.xml contains a property reference (e.g., `${project.version}`), the detector SHALL attempt to resolve it from the `<properties>` section. Unresolvable property references SHALL produce versionless purls.

#### Scenario: Resolvable property reference

- **WHEN** `pom.xml` contains `<properties><spring.version>6.1.0</spring.version></properties>` and `<dependency><groupId>org.springframework</groupId><artifactId>spring-core</artifactId><version>${spring.version}</version></dependency>`
- **THEN** the detector SHALL produce `pkg:maven/org.springframework/spring-core@6.1.0`

#### Scenario: Unresolvable property reference

- **WHEN** `pom.xml` contains `<dependency><groupId>org.springframework</groupId><artifactId>spring-core</artifactId><version>${parent.version}</version></dependency>` and the property is not defined in the `<properties>` section
- **THEN** the detector SHALL produce `pkg:maven/org.springframework/spring-core` (versionless)

### Requirement: Exact versions produce versioned purls

Exact version strings SHALL produce versioned purls. Maven version ranges (e.g., `[1.0,2.0)`, `(,1.0]`) SHALL produce versionless purls.

#### Scenario: Exact version

- **WHEN** a dependency specifies version `6.1.0`
- **THEN** the detector SHALL produce a versioned purl with `@6.1.0`

#### Scenario: Version range produces versionless purl

- **WHEN** a dependency specifies version `[1.0,2.0)`
- **THEN** the detector SHALL produce a versionless purl

### Requirement: Deduplication across build files

When multiple build files (pom.xml, build.gradle, version catalog) declare the same dependency, the detector SHALL produce only one purl for that dependency.

#### Scenario: Duplicate across pom.xml and build.gradle

- **WHEN** both `pom.xml` and `build.gradle` declare a dependency on `org.springframework:spring-core`
- **THEN** the detector SHALL produce only one purl for `spring-core`
