# Roadmap

Version 0.1.0 focuses on local JSON contracts, conservative surface checks,
line-based reports and bounded processing.

Potential follow-ups, not shipped features:

1. Direction-aware rules for a carefully specified subset of scalar schemas.
2. A documented JSON Schema for reports and reusable CI examples.
3. Baseline management helpers that preserve explicit local-only data handling.

Any expansion must preserve no-credential operation and avoid putting input
values into reports. Remote reference fetching, automatic posting and hosted
contract storage are outside the current scope.
