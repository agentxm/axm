## ADDED Requirements

### Requirement: Parse Gemfile for Ruby gem dependencies

The gem detector SHALL parse `Gemfile` in the project directory and extract `gem` directives as `pkg:gem` purls.

#### Scenario: Gem directives extracted

- **WHEN** `Gemfile` contains `gem 'rails', '~> 7.0'` and `gem 'puma', '>= 5.0'`
- **THEN** the detector SHALL produce purls for `rails` and `puma`

#### Scenario: Gem with double-quoted name

- **WHEN** `Gemfile` contains `gem "sidekiq"`
- **THEN** the detector SHALL produce a purl for `sidekiq`

#### Scenario: Missing Gemfile

- **WHEN** the project directory does not contain a `Gemfile`
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed Gemfile

- **WHEN** `Gemfile` contains unparseable content
- **THEN** the detector SHALL log a warning and return an empty array

### Requirement: Parse gemspec files for gem dependencies

The gem detector SHALL parse `*.gemspec` files in the project directory and extract dependencies declared via `add_dependency`, `add_runtime_dependency`, and `add_development_dependency` method calls as `pkg:gem` purls.

#### Scenario: Runtime dependency from gemspec

- **WHEN** a `.gemspec` file contains `spec.add_dependency "nokogiri", "~> 1.15"`
- **THEN** the detector SHALL produce a purl for `nokogiri`

#### Scenario: add_runtime_dependency from gemspec

- **WHEN** a `.gemspec` file contains `spec.add_runtime_dependency "faraday", ">= 1.0"`
- **THEN** the detector SHALL produce a purl for `faraday`

#### Scenario: Development dependency from gemspec

- **WHEN** a `.gemspec` file contains `spec.add_development_dependency "rspec", "~> 3.0"`
- **THEN** the detector SHALL produce a purl for `rspec`

#### Scenario: Missing gemspec files

- **WHEN** the project directory does not contain any `.gemspec` files
- **THEN** the detector SHALL return an empty array from gemspec parsing
- **AND** no error SHALL be raised

### Requirement: Deduplication across Gemfile and gemspec

When both `Gemfile` and gemspec files declare the same gem, the detector SHALL produce only one purl for that gem.

#### Scenario: Duplicate gem across files

- **WHEN** `Gemfile` contains `gem 'nokogiri'` and a `.gemspec` file contains `spec.add_dependency "nokogiri"`
- **THEN** the detector SHALL produce only one purl for `nokogiri`

### Requirement: Exact versions produce versioned purls

Exact version pins produce versioned purls. Range operators (`~>`, `>=`, `<=`, `>`, `<`, `!=`) SHALL produce versionless purls.

#### Scenario: Exact version pin

- **WHEN** `Gemfile` contains `gem 'puma', '5.6.7'`
- **THEN** the detector SHALL produce `pkg:gem/puma@5.6.7`

#### Scenario: Pessimistic constraint produces versionless purl

- **WHEN** `Gemfile` contains `gem 'rails', '~> 7.0'`
- **THEN** the detector SHALL produce `pkg:gem/rails` (versionless)

#### Scenario: Greater-than-or-equal produces versionless purl

- **WHEN** `Gemfile` contains `gem 'puma', '>= 5.0'`
- **THEN** the detector SHALL produce `pkg:gem/puma` (versionless)

#### Scenario: No version specified produces versionless purl

- **WHEN** `Gemfile` contains `gem 'sidekiq'`
- **THEN** the detector SHALL produce `pkg:gem/sidekiq` (versionless)

### Requirement: Path and git dependencies skipped

Dependencies using `:path` or `:git` options SHALL be skipped. These represent local or non-registry sources that are not meaningful for package compatibility discovery.

#### Scenario: Path dependency skipped

- **WHEN** `Gemfile` contains `gem 'my-lib', path: '../my-lib'`
- **THEN** the detector SHALL not produce a purl for `my-lib`

#### Scenario: Git dependency skipped

- **WHEN** `Gemfile` contains `gem 'my-lib', git: 'https://github.com/org/my-lib'`
- **THEN** the detector SHALL not produce a purl for `my-lib`

#### Scenario: GitHub shorthand skipped

- **WHEN** `Gemfile` contains `gem 'my-lib', github: 'org/my-lib'`
- **THEN** the detector SHALL not produce a purl for `my-lib`
