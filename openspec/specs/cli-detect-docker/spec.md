## ADDED Requirements

### Requirement: Parse Dockerfile for Docker image dependencies

The Docker detector SHALL parse `Dockerfile` in the project directory and extract `FROM` directives. Each image reference SHALL be converted to a `pkg:docker` purl with typed `PackageUrlParts`.

#### Scenario: Simple FROM directive

- **WHEN** `Dockerfile` contains `FROM node:18-alpine`
- **THEN** the detector SHALL produce a purl for `node` with version `18-alpine`

#### Scenario: Missing Dockerfile

- **WHEN** the project directory does not contain a `Dockerfile`
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed Dockerfile

- **WHEN** `Dockerfile` contains no valid FROM directives
- **THEN** the detector SHALL return an empty array

#### Scenario: Multi-stage build

- **WHEN** `Dockerfile` contains `FROM node:18 AS builder` and `FROM nginx:alpine`
- **THEN** the detector SHALL produce purls for both `node` and `nginx`

#### Scenario: FROM with AS alias

- **WHEN** `Dockerfile` contains `FROM python:3.11 AS base`
- **THEN** the detector SHALL produce a purl for `python` with version `3.11` and ignore the alias

### Requirement: Parse docker-compose files for image dependencies

The Docker detector SHALL parse `docker-compose.yml` and `docker-compose.yaml` in the project directory and extract `image:` values from service definitions. Each image reference SHALL be converted to a `pkg:docker` purl.

#### Scenario: Images from docker-compose.yml

- **WHEN** `docker-compose.yml` contains services with `image: redis:7` and `image: postgres:15`
- **THEN** the detector SHALL produce purls for `redis` and `postgres`

#### Scenario: Missing docker-compose files

- **WHEN** the project directory does not contain `docker-compose.yml` or `docker-compose.yaml`
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: docker-compose.yaml variant

- **WHEN** the project directory contains `docker-compose.yaml` (not `.yml`)
- **THEN** the detector SHALL parse it and extract image references

### Requirement: Image name parsed into namespace and name

The detector SHALL parse Docker image references to extract an optional namespace (registry and/or organization) and the image name.

#### Scenario: Official image without namespace

- **WHEN** the image reference is `nginx:alpine`
- **THEN** the detector SHALL produce a purl with `type: "docker"`, no namespace, `name: "nginx"`

#### Scenario: Organization-scoped image

- **WHEN** the image reference is `library/nginx:1.25`
- **THEN** the detector SHALL produce a purl with `type: "docker"`, `namespace: "library"`, `name: "nginx"`

#### Scenario: Custom registry image

- **WHEN** the image reference is `ghcr.io/org/myapp:latest`
- **THEN** the detector SHALL produce a purl with `namespace: "ghcr.io/org"`, `name: "myapp"`

### Requirement: Tags as versions

Image tags SHALL be treated as versions. Exact tags produce versioned purls. The `latest` tag or absent tag produce versionless purls.

#### Scenario: Exact tag

- **WHEN** the image reference is `node:18.17.0`
- **THEN** the detector SHALL produce `pkg:docker/node@18.17.0`

#### Scenario: Named tag

- **WHEN** the image reference is `node:18-alpine`
- **THEN** the detector SHALL produce `pkg:docker/node@18-alpine`

#### Scenario: Latest tag

- **WHEN** the image reference is `nginx:latest`
- **THEN** the detector SHALL produce `pkg:docker/nginx` (versionless)

#### Scenario: No tag

- **WHEN** the image reference is `nginx`
- **THEN** the detector SHALL produce `pkg:docker/nginx` (versionless)

### Requirement: Variable references skipped

`FROM` directives using unresolvable variable references SHALL be skipped. A variable reference is unresolvable when the referenced `ARG` has no default value.

#### Scenario: Variable without default skipped

- **WHEN** `Dockerfile` contains `ARG BASE_IMAGE` (no default) and `FROM ${BASE_IMAGE}`
- **THEN** the detector SHALL not produce a purl for that FROM directive

#### Scenario: Variable with default resolved

- **WHEN** `Dockerfile` contains `ARG BASE_IMAGE=node:18` and `FROM ${BASE_IMAGE}`
- **THEN** the detector SHALL produce a purl for `node` with version `18`
