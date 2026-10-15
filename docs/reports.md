# Report version 1

JSON reports contain `version`, `ok`, `policy`, `coverage`, `operations`,
`summary` and `findings`. Coverage is `openapi-surface-v1`.

```json
{
  "version": 1,
  "ok": false,
  "policy": { "allowReview": false },
  "coverage": "openapi-surface-v1",
  "operations": { "base": 1, "head": 1 },
  "summary": { "breaking": 1, "review": 0, "addition": 0 },
  "findings": [
    {
      "id": 1,
      "code": "required-parameter-added",
      "severity": "breaking",
      "method": "GET",
      "baseOperation": 1,
      "base": { "source": "base", "line": 6 },
      "headOperation": 1,
      "head": { "source": "head", "line": 7 }
    }
  ]
}
```

This is a reduced fictional report. A location points to the changed item when
available and otherwise to its operation. Removed operations have no `head`;
added operations have no `base`. Ordinals count methods in each document's path
declaration order, beginning at 1. On a minified file, ordinals help distinguish
operations sharing a line; pretty-print exports for convenient navigation.

Findings are emitted in baseline operation order, then additions in head order.
Reports are deterministic for identical input bytes and policy. Semantically
equivalent documents with different declaration order or formatting can change
ordinals/lines while retaining the same substantive findings.

## Rule codes

| Class | Codes |
| --- | --- |
| Breaking | `operation-removed`, `required-parameter-added`, `parameter-now-required`, `required-body-added`, `body-now-required`, `request-media-removed`, `response-media-removed` |
| Addition | `operation-added`, `optional-parameter-added`, `parameter-now-optional`, `optional-body-added`, `body-now-optional`, `request-media-added` |
| Review | `parameter-removed`, `parameter-shape-changed`, `request-body-removed`, `request-schema-changed`, `response-schema-changed`, `response-media-added`, `response-added`, `response-removed`, `response-metadata-changed`, `security-changed`, `servers-changed`, `operation-metadata-changed` |

`*-schema-changed` compares the entire media object structurally, including
schema, encoding and examples. It does not prove which schema constraint is
compatible. Response changes and security changes are conservative review
findings; default policy blocks them.

## Errors

Invalid/unsupported inputs return exit 2, with a fixed `error.code` and optional
source label/line. Example:

```json
{ "version": 1, "ok": false, "error": { "code": "duplicate-key", "source": "base", "line": 4 } }
```

Codes cover usage, input reading/parsing, document structures, references,
security requirements and all documented limits. Consumers should branch on
exit code/class rather than human wording. Errors never include input snippets,
raw field names, filenames or underlying runtime error messages.

With `--format markdown`, success/findings are a review table; fatal errors go
to stderr as a generic message. `--format json` produces one JSON document for
both findings and errors. Help/version always print text.
