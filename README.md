# API Drift Guard

[![CI](https://github.com/Dcastroro/api-drift-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/Dcastroro/api-drift-guard/actions/workflows/ci.yml)

**Catch API contract changes before they surprise an integration.**

Compare two local OpenAPI JSON documents. Detect removed operations, new
required inputs and removed media types; route structural schema and security
changes to review. The default CI gate blocks both breaking and review findings.

Reports use fixed rule codes, HTTP methods and source line numbers. They never
copy route names, parameter names, URLs, examples, credentials or schema values.

Node.js 22+ · no dependencies · no credentials · no network requests.

## Try it

```sh
git clone https://github.com/Dcastroro/api-drift-guard.git
cd api-drift-guard
npm ci --ignore-scripts
npm run demo
```

The fictional additive example passes with two additions. The breaking example
deliberately exits 1 and prints a Markdown review:

```sh
npm run demo:breaking
```

```text
REVIEW REQUIRED: 2 breaking, 1 review, 0 addition(s).
```

The line above summarizes the breaking fixture; the command renders the same
findings as a table. Nothing calls the API described by a contract.

## Compare your contracts

```sh
node bin/api-drift-guard.mjs --base /path/to/before.json --head /path/to/after.json
node bin/api-drift-guard.mjs --base /path/to/before.json --head /path/to/after.json --format json
node bin/api-drift-guard.mjs --base /path/to/before.json --head /path/to/after.json --format markdown
```

Paths resolve from the current working directory. Quote paths containing
spaces. Inputs must be local regular files; symlinks and special files are
rejected. This release accepts JSON OpenAPI 3.0.x and 3.1.x documents, not YAML,
OpenAPI 2.x or 3.2.x.

## Read the result

| Class | Examples | Default gate |
| --- | --- | --- |
| `breaking` | Operation removed; required parameter/body introduced; media type removed | Block |
| `review` | Schema/serialization changed; response status changed; security/server configuration changed | Block |
| `addition` | Operation added; optional input added; required input made optional | Pass |

Use a finding's `base` or `head` line to open the corresponding **local** file.
For example, `head:7` means line 7 in the file passed to `--head`. Operation
ordinals disambiguate compact/minified files without exposing route names.
For convenient line navigation, use pretty-printed exports.

The comparison is directional: `base` is the old provider contract, `head` is
the proposed provider contract. Request input constraints and response output
constraints have different compatibility implications. Rather than guessing a
schema's full semantics, **any structural schema change is sent to review**.

To consciously allow review-only findings:

```sh
node bin/api-drift-guard.mjs --base before.json --head after.json --allow-review
```

Breaking findings still block. The report records whether this override was
used. Without the flag, review findings cannot silently produce a passing gate.

| Exit code | Meaning |
| --- | --- |
| `0` | Selected gate policy passed |
| `1` | Findings block the policy |
| `2` | Invalid, unsupported, unreadable or over-limit input |

`--help` and `--version` need no files. Reports are available as text, JSON or
Markdown; no report is published or uploaded automatically.

## What is compared

- Path/method operations and inherited path parameters, with operation overrides.
- Parameter identity, requiredness and structural shape; header names match
  case-insensitively, query/path/cookie names remain case-sensitive.
- Request-body requiredness and request/response media types.
- Response statuses, schema/content changes and response metadata such as headers.
- Effective security requirements **and the schemes they reference**.
- Effective servers, operation identifiers, callbacks and remaining operation
  metadata, excluding vendor extensions and ordinary documentation fields.

Local JSON Pointer `$ref` references are resolved, including escaped tokens.
Recursive schema graphs are supported. A referenced component change is caught
even when the `$ref` text stays the same. Referenced object locations point to
the definition's line. Unused component changes do not create operation findings.

Comparison uses cached structural fingerprints and reference closures, avoiding
repeated expansion of shared schemas. Raw fingerprints are internal and are not
included in reports. Object-key order is ignored; array order is preserved.

## Scope and conservative behavior

This is a bounded API surface guard, **not a complete OpenAPI validator or a
proof of backward compatibility**. Validate your contract with your existing
OpenAPI tooling as well. Passing means this rule set found nothing blocking;
it says nothing about actual server behavior, data migrations or client code.

Schema/content comparison is structural. Changes to examples or annotations
inside a schema/content object can therefore require review too. Schema
equivalence, request/response variance, enums, nullable semantics, compositions
and constraints are not individually proved. Reference renames can also cause
a conservative review.

Ordinary operation descriptions, summaries, tags, external docs and response
descriptions are ignored. Vendor extensions, unused components and unrelated
top-level metadata are outside the rule set. Webhooks, custom schema dialects,
`$id`, anchors and dynamic references are rejected explicitly.

External references are never fetched. A conservative preflight checks `$ref`
and unsupported resolution keywords throughout the document, even inside
example payloads or unused components; those inputs can be rejected rather
than partially assessed. Non-schema reference objects may contain only `$ref`,
`summary` and `description`; other siblings are rejected. Internal schema
references retain their sibling fields in structural comparison.

## Bounded processing

| Limit, per document unless noted | Bound |
| --- | --- |
| UTF-8 input | 4 MiB |
| JSON values | 100,000 |
| JSON nesting | 96 levels |
| Operations | 2,000 |
| Structural/reference work units and comparison steps (separate budgets) | 200,000 each |
| Stored source-pointer bytes | 16 MiB |
| Cumulative fingerprint input bytes | 64 MiB |
| Findings per comparison | 10,000 |

Exceeding a limit produces exit 2. Reports are not silently truncated. Strict
JSON parsing rejects duplicate keys so a later key cannot hide an earlier
operation. Unsupported input blocks the gate rather than being treated as a
clean comparison.

The suite includes a 1,500-operation shared-component regression test. This is
a correctness/scale fixture, not an enterprise throughput benchmark. The tool
runs in one Node process; it is intended for bounded contracts in local and CI
workflows. See [VALIDATION.md](VALIDATION.md) for verification evidence.

## Use in automation

After placing a reviewed checkout at `tools/api-drift-guard`:

```yaml
- name: Check API drift
  run: node tools/api-drift-guard/bin/api-drift-guard.mjs --base contracts/base.json --head contracts/head.json --format json
```

The non-zero exit code blocks the workflow. Both files must already exist;
Task Relay or your existing CI can prepare the baseline. This tool does not
fetch Git history, contact a registry or access credentials.

See [Task Relay integration](docs/automation.md), [rule codes and report
format](docs/reports.md) and [security design](SECURITY.md).

## JavaScript API

```js
import { compareContracts } from './src/index.mjs';

// The caller supplies JSON text; the comparator performs no file I/O.
const report = compareContracts(oldJsonText, newJsonText);
console.log(report.ok);
```

The text API applies the same parse/graph limits. It throws `ContractError`
with fixed codes for unsupported or invalid inputs. Reports contain no raw
input names or values. The optional third argument is `{ allowReview: true }`;
non-boolean policy values are rejected.

## Development

```sh
npm ci --ignore-scripts
npm run check
```

Tests cover rule behavior, inherited settings, local/cyclic references, parsing
limits, duplicate keys, CLI exit codes, large shared graphs and sensitive-data
omission in all three output formats. CI runs on Windows/Linux with Node.js
22/24. This release runs from source; it is not published to npm.

MIT license. Created by David Castro. See [CONTRIBUTING.md](CONTRIBUTING.md)
and [ROADMAP.md](ROADMAP.md).
