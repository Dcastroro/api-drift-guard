# Security design

## Credentials and data flow

The shipped CLI and comparator require no credential, API key or account.
They do not read credential stores, load `.env` files, read environment values,
spawn commands, evaluate schemas or make network requests. Inputs are two
explicitly selected local files. Native hashing is used for internal structural
comparison, not for storing credentials or producing public value digests.

No embedded credentials are present in source or examples. CI uses GitHub's
ephemeral checkout authentication with read-only repository permissions and
`persist-credentials: false`; no custom secret is required by the workflow.

## Output boundary

Reports contain only fixed codes/severities, the finite set of HTTP methods,
numeric counts, operation ordinals and source labels (`base`/`head`) with line
numbers. They omit route/parameter/component names, titles, URLs, examples,
schema values, local file paths, raw input lines and OS/parser messages.
There is no option to dump raw input or verbose snapshots.

This avoids echoing secrets accidentally embedded in contracts. It does not
find, remove or certify the absence of secrets in the input files themselves.
Inputs remain in process memory during the run; host compromise, process
inspection, operating-system dumps and logging added by callers are outside
this boundary. Counts and line numbers still reveal limited structural metadata.

## Input boundaries

External references are rejected without being fetched. Local references use
own-property lookup; prototypes are not traversed. The parser uses null-prototype
objects and rejects duplicate keys, non-finite numbers and invalid JSON.
Depth, value count, input bytes, operation count, reference/comparison work,
cumulative fingerprint bytes, source-pointer storage and findings are bounded.
Source-file reads have an actual byte cap in
addition to their initial file-size check.

The CLI rejects known symlinks/special files before opening and verifies the
opened handle is a regular file. This is not a sandbox against an attacker
concurrently replacing filesystem entries. Run against files you control in a
normal local or isolated CI workspace.

## Gate behavior

Breaking findings and review findings fail by default. `--allow-review` is an
explicit policy override recorded in the report. Invalid, unsupported and
over-limit documents exit 2, never a clean pass. This is not a complete OpenAPI
validator or compatibility proof; the supported rule set is documented.

For a vulnerability report, contact the maintainer through the contact channel
linked on their GitHub profile. Use fabricated data in reproductions; do not
post real contracts, credentials or private URLs in public issues.
