# Contributing

Use Node.js 22+ and run `npm ci --ignore-scripts`, then `npm run check`.
There are no runtime or development dependencies.

Changes should explain the rule, its direction and its limits. Add focused
regressions for compatibility decisions and references. Preserve the default
review-blocking gate, bounded work and value-free output contract.

Never log input values, names, URLs or filenames for debugging. Use fabricated
fixtures and sentinel-based output tests. Do not add network reference loading,
credential requirements, schema evaluation or command execution.

New semantic compatibility rules need separate request/response reasoning and
cases for nullable/composition behavior. When unsure, emit review or reject the
unsupported input rather than claiming compatibility.
