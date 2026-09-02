# Security Policy

## Supported Versions

`@panmdaa/jwt` is in early development.

Security fixes are guaranteed for:

- the current `main` branch
- the latest published version

Older releases should be considered unsupported unless stated otherwise.

## What To Report

Please report vulnerabilities involving:

- arbitrary code execution or prototype pollution in library input handling
- cross-site scripting (XSS) vectors when library output is embedded in HTML or CSS
- denial-of-service vectors (infinite loops, excessive memory allocation, regex backtracking)
- dependency supply-chain issues (though there are zero runtime dependencies)

If you are unsure whether something is security-relevant, report it anyway.

## How To Report

Do **not** open public issues for suspected vulnerabilities.

Report them privately to:

- `is.kkokotero@gmail.com`

When possible, include:

- a clear description of the issue
- affected version or commit
- reproduction steps
- proof of concept or sample code
- expected impact
- suggested remediation

## Response Expectations

The project will try to:

- acknowledge reports within 72 hours
- provide an initial assessment within 7 days when practical
- coordinate a fix before public disclosure

These are goals, not guarantees, especially while the project is small.

## Disclosure

Please allow time for coordinated remediation before disclosing a vulnerability publicly.

Once a fix is available, the project may publish:

- a summary of the issue
- affected scope
- remediation guidance

## Security Design Notes

`@panmdaa/jwt` reduces risk by:

- maintaining zero runtime dependencies
- keeping the API surface minimal and predictable
- validating inputs to public functions
- failing fast on malformed inputs where practical
