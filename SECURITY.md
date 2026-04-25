# Security Policy

## Supported Versions

DockBricks is currently pre-1.0. Security fixes are applied to the latest release on `main`.

## Local Data

DockBricks stores database configuration locally on the user's machine. This includes database names, ports, categories, selected container engine, and database passwords used for local connection strings and container environment variables.

DockBricks does not use a hosted backend for this data. Anyone with access to your local user account or app storage may be able to read saved database configuration, so treat the device and user profile as trusted.

## Reporting a Vulnerability

Please do not open public issues for security vulnerabilities.

Report privately through GitHub Security Advisories:
`https://github.com/pallepadehat/DockBricks/security/advisories/new`

Include:

- affected version
- environment details (OS, Docker/Podman version)
- reproduction steps or proof-of-concept
- potential impact

You can expect:

- acknowledgment within 72 hours
- regular status updates during triage
- coordinated disclosure once a fix is available
