# Validation

Verified locally on 15 October 2026 with Windows and Node.js v24.20.0:

- Syntax checks and all 49 tests pass; none skipped.
- The additive demo exits 0 with two additions.
- The breaking demo exits 1 with two breaking findings and one review finding.
- Text/JSON/Markdown reports omit sentinel values placed in route names,
  parameter names, examples, schema values and server URLs.
- CLI errors omit filenames, invalid snippets and raw runtime messages.
- A 1,500-operation shared-component fixture passes unchanged comparison.
- Byte/node/depth/source-pointer limits, duplicate keys, finding limits,
  unresolved references and unsupported resolution are covered.

The fixture is a scale regression test, not a production performance benchmark.
CI runs the same checks and additive demo on Ubuntu/Windows with Node.js 22/24;
see the Actions tab for actual remote results.

All examples and test data are fictional. No credentials are needed to run the
CLI, API, demos or tests. The distributed CLI/core imports only local modules
and Node's filesystem, UTF-8 decoding and hashing facilities.

Reference semantics are grounded in the official
[OpenAPI 3.1 specification](https://spec.openapis.org/oas/v3.1.0.html) and
[OpenAPI 3.0 specification](https://spec.openapis.org/oas/v3.0.3.html).
Breaking/review classifications are this tool's conservative policy, not a
claim that the specification proves full compatibility.
