import { parseContract, ContractError, LIMITS } from './input.mjs';
import { buildModel } from './model.mjs';
export { ContractError, LIMITS } from './input.mjs';

/** Inputs are JSON strings. No file reads, network access or command execution. */
export function compareContracts(baseText, headText, { allowReview = false } = {}) {
  return compareParsed(parseContract(baseText, 'base'), parseContract(headText, 'head'), { allowReview });
}

export function compareParsed(baseContext, headContext, { allowReview = false } = {}) {
  if (typeof allowReview !== 'boolean') throw new ContractError('invalid-policy');
  const base = buildModel({ ...baseContext, source: 'base' });
  const head = buildModel({ ...headContext, source: 'head' });
  const findings = [];
  let comparisonWork = 0;
  const tick = () => {
    if (++comparisonWork > LIMITS.references) throw new ContractError('comparison-limit');
  };
  function add(code, severity, before, after, baseLocation, headLocation) {
    if (findings.length >= LIMITS.findings) throw new ContractError('finding-limit');
    findings.push({ id: findings.length + 1, code, severity, method: (before ?? after).method,
      ...(before ? { baseOperation: before.ordinal, base: baseLocation ?? before.location } : {}),
      ...(after ? { headOperation: after.ordinal, head: headLocation ?? after.location } : {}) });
  }
  function diffContent(before, after, left, right, side) {
    for (const [media, prior] of before) {
      tick();
      const next = after.get(media);
      if (!next) add(`${side}-media-removed`, 'breaking', left, right, prior.location);
      else if (prior.signature !== next.signature) add(`${side}-schema-changed`, 'review', left, right, prior.location, next.location);
    }
    for (const [media, next] of after) {
      tick();
      if (!before.has(media)) add(`${side}-media-added`, side === 'request' ? 'addition' : 'review', left, right, undefined, next.location);
    }
  }
  for (const [key, before] of base.operations) {
    tick();
    const after = head.operations.get(key);
    if (!after) { add('operation-removed', 'breaking', before); continue; }
    for (const [name, prior] of before.parameters) {
      tick();
      const next = after.parameters.get(name);
      if (!next) { add('parameter-removed', 'review', before, after, prior.location); continue; }
      if (!prior.required && next.required) add('parameter-now-required', 'breaking', before, after, prior.location, next.location);
      if (prior.required && !next.required) add('parameter-now-optional', 'addition', before, after, prior.location, next.location);
      if (prior.signature !== next.signature) add('parameter-shape-changed', 'review', before, after, prior.location, next.location);
    }
    for (const [name, next] of after.parameters) {
      tick();
      if (!before.parameters.has(name)) add(next.required ? 'required-parameter-added' : 'optional-parameter-added',
        next.required ? 'breaking' : 'addition', before, after, undefined, next.location);
    }
    if (!before.body && after.body) add(after.body.required ? 'required-body-added' : 'optional-body-added',
      after.body.required ? 'breaking' : 'addition', before, after, undefined, after.body.location);
    else if (before.body && !after.body) add('request-body-removed', 'review', before, after, before.body.location);
    else if (before.body && after.body) {
      if (!before.body.required && after.body.required) add('body-now-required', 'breaking', before, after, before.body.location, after.body.location);
      if (before.body.required && !after.body.required) add('body-now-optional', 'addition', before, after, before.body.location, after.body.location);
      diffContent(before.body.content, after.body.content, before, after, 'request');
    }
    for (const [status, prior] of before.responses) {
      tick();
      const next = after.responses.get(status);
      if (!next) { add('response-removed', 'review', before, after, prior.location); continue; }
      diffContent(prior.content, next.content, before, after, 'response');
      if (prior.signature !== next.signature) add('response-metadata-changed', 'review', before, after, prior.location, next.location);
    }
    for (const [status, next] of after.responses) {
      tick();
      if (!before.responses.has(status)) add('response-added', 'review', before, after, undefined, next.location);
    }
    if (before.security !== after.security) add('security-changed', 'review', before, after);
    if (before.servers !== after.servers) add('servers-changed', 'review', before, after);
    if (before.other !== after.other) add('operation-metadata-changed', 'review', before, after);
  }
  for (const [key, after] of head.operations) if (!base.operations.has(key)) add('operation-added', 'addition', undefined, after);
  const summary = Object.fromEntries(['breaking', 'review', 'addition'].map(severity => [severity, findings.filter(finding => finding.severity === severity).length]));
  return {
    version: 1, ok: summary.breaking === 0 && (allowReview || summary.review === 0),
    policy: { allowReview: Boolean(allowReview) },
    coverage: 'openapi-surface-v1',
    operations: { base: base.operations.size, head: head.operations.size }, summary, findings,
  };
}
