import { createHash } from 'node:crypto';
import { ContractError, LIMITS, pointer } from './input.mjs';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
const ANNOTATIONS = new Set(['summary', 'description', 'tags', 'externalDocs']);
export const own = (object, key) => Object.hasOwn(object, key);

export function buildModel(context) {
  const { document, source, locations } = context;
  const fail = (code, path = '') => { throw new ContractError(code, source, locations.get(path)); };
  if (!object(document) || typeof document.openapi !== 'string' || !/^3\.(?:0|1)\.[0-9]+$/.test(document.openapi)
    || !object(document.info) || typeof document.info.title !== 'string' || typeof document.info.version !== 'string'
    || !object(document.paths)) fail('unsupported-document');
  if (own(document, 'webhooks')) fail('unsupported-webhooks', '/webhooks');
  if (own(document, 'jsonSchemaDialect')) fail('unsupported-dialect', '/jsonSchemaDialect');

  const refs = new Map();
  const resolveReference = (ref, path) => {
    if (typeof ref !== 'string' || (ref !== '#' && !ref.startsWith('#/'))) fail('external-or-invalid-ref', path);
    if (refs.has(ref)) return refs.get(ref);
    let target = document;
    let targetPath = '';
    if (ref !== '#') {
      let fragment;
      try { fragment = decodeURIComponent(ref.slice(2)); } catch { fail('invalid-ref', path); }
      for (const token of fragment.split('/')) {
        if (/~(?:[^01]|$)/.test(token)) fail('invalid-ref', path);
        const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
        if ((!object(target) && !Array.isArray(target)) || !own(target, key)) fail('unresolved-ref', path);
        target = target[key];
        targetPath = pointer(targetPath, key);
      }
    }
    const resolved = { value: target, path: targetPath };
    refs.set(ref, resolved);
    return resolved;
  };
  function preflight(value, path) {
    if (!value || typeof value !== 'object') return;
    if (object(value) && own(value, '$ref')) resolveReference(value.$ref, pointer(path, '$ref'));
    if (object(value) && ['$id', '$schema', '$dynamicRef', '$dynamicAnchor', '$anchor', '$recursiveRef', '$recursiveAnchor'].some(key => own(value, key))) {
      fail('unsupported-schema-resolution', path);
    }
    for (const [key, child] of Object.entries(value)) preflight(child, pointer(path, key));
  }
  preflight(document, '');
  function dereference(value, path) {
    const visited = new Set();
    while (object(value) && own(value, '$ref')) {
      if (Object.keys(value).some(key => !['$ref', 'summary', 'description'].includes(key))) fail('unsupported-ref-siblings', path);
      if (visited.has(value.$ref)) fail('cyclic-object-ref', path);
      visited.add(value.$ref);
      ({ value, path } = resolveReference(value.$ref, path));
    }
    if (!object(value)) fail('invalid-object', path);
    return { value, path };
  }
  let referenceWork = 0;
  let hashedBytes = 0;
  function update(hash, text) {
    hashedBytes += Buffer.byteLength(text, 'utf8');
    if (hashedBytes > LIMITS.hashBytes) fail('hash-limit');
    hash.update(text);
    return hash;
  }
  const cache = new WeakMap();
  const finalCache = new WeakMap();
  function structural(value) {
    if (++referenceWork > LIMITS.references) fail('comparison-limit');
    if (!value || typeof value !== 'object') return { digest: JSON.stringify(value), refs: new Set() };
    if (cache.has(value)) return cache.get(value);
    const hash = createHash('sha256');
    const referenced = new Set();
    update(hash, Array.isArray(value) ? 'array:' : 'object:');
    const keys = Object.keys(value);
    if (!Array.isArray(value)) keys.sort();
    for (const key of keys) {
      update(hash, JSON.stringify(key));
      update(hash, ':');
      const child = structural(value[key]);
      update(hash, child.digest);
      update(hash, ';');
      for (const ref of child.refs) {
        if (++referenceWork > LIMITS.references) fail('comparison-limit');
        referenced.add(ref);
      }
    }
    if (object(value) && own(value, '$ref')) referenced.add(value.$ref);
    const result = { digest: hash.digest('hex'), refs: referenced };
    cache.set(value, result);
    return result;
  }
  function signature(value) {
    if (value && typeof value === 'object' && finalCache.has(value)) return finalCache.get(value);
    const initial = structural(value);
    const queue = [...initial.refs];
    const definitions = new Map();
    for (let index = 0; index < queue.length; index += 1) {
      const ref = queue[index];
      if (definitions.has(ref)) continue;
      if (++referenceWork > LIMITS.references) fail('comparison-limit');
      const target = structural(resolveReference(ref, '').value);
      definitions.set(ref, target.digest);
      for (const next of target.refs) {
        if (++referenceWork > LIMITS.references) fail('comparison-limit');
        if (!definitions.has(next)) queue.push(next);
      }
    }
    const hash = update(createHash('sha256'), initial.digest);
    for (const [ref, digest] of [...definitions].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      update(hash, JSON.stringify([ref, digest]));
    }
    const result = hash.digest('hex');
    if (value && typeof value === 'object') finalCache.set(value, result);
    return result;
  }
  const loc = path => ({ source, ...(locations.has(path) ? { line: locations.get(path) } : {}) });
  const securityCache = new WeakMap();
  function security(requirements, path) {
    if (!Array.isArray(requirements)) fail('invalid-security', path);
    if (securityCache.has(requirements)) return securityCache.get(requirements);
    const schemes = new Map();
    for (const requirement of requirements) {
      if (!object(requirement)) fail('invalid-security', path);
      for (const [name, scopes] of Object.entries(requirement)) {
        if (!Array.isArray(scopes) || !scopes.every(scope => typeof scope === 'string')) fail('invalid-security', path);
        if (!object(document.components?.securitySchemes) || !own(document.components.securitySchemes, name)) fail('unresolved-security-scheme', path);
        const scheme = dereference(document.components.securitySchemes[name], pointer('/components/securitySchemes', name));
        schemes.set(name, signature(scheme.value));
      }
    }
    const result = signature({ requirements, schemes: [...schemes].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0) });
    securityCache.set(requirements, result);
    return result;
  }
  const parameterCache = new WeakMap();
  function parameters(raw, path) {
    if (raw === undefined) return new Map();
    if (!Array.isArray(raw)) fail('invalid-parameters', path);
    if (parameterCache.has(raw)) return parameterCache.get(raw);
    const result = new Map();
    raw.forEach((entry, index) => {
      const actual = dereference(entry, pointer(path, index));
      const parameter = actual.value;
      if (typeof parameter.name !== 'string' || !parameter.name || !['path', 'query', 'header', 'cookie'].includes(parameter.in)
        || (own(parameter, 'required') && typeof parameter.required !== 'boolean')
        || (parameter.in === 'path' && parameter.required !== true)) fail('invalid-parameter', actual.path);
      const key = `${parameter.in}:${parameter.in === 'header' ? parameter.name.toLowerCase() : parameter.name}`;
      if (result.has(key)) fail('duplicate-parameter', actual.path);
      const { name, in: placement, required, ...shape } = parameter;
      for (const annotation of ANNOTATIONS) delete shape[annotation];
      result.set(key, { required: required === true, signature: signature(shape), location: loc(actual.path) });
    });
    parameterCache.set(raw, result);
    return result;
  }
  const contentCache = new WeakMap();
  function content(raw, path) {
    if (raw === undefined) return new Map();
    if (!object(raw)) fail('invalid-content', path);
    if (contentCache.has(raw)) return contentCache.get(raw);
    const result = new Map(Object.entries(raw).map(([media, value]) => {
      if (!object(value)) fail('invalid-content', pointer(path, media));
      return [media, { signature: signature(value), location: loc(pointer(path, media)) }];
    }));
    contentCache.set(raw, result);
    return result;
  }
  function body(raw, path) {
    if (raw === undefined) return undefined;
    const actual = dereference(raw, path);
    if (!object(actual.value.content) || (own(actual.value, 'required') && typeof actual.value.required !== 'boolean')) fail('invalid-body', actual.path);
    return { required: actual.value.required === true, content: content(actual.value.content, pointer(actual.path, 'content')), location: loc(actual.path) };
  }
  const responseCache = new WeakMap();
  function responses(raw, path) {
    if (!object(raw)) fail('invalid-responses', path);
    if (responseCache.has(raw)) return responseCache.get(raw);
    const result = new Map();
    for (const [status, response] of Object.entries(raw)) {
      if (status.startsWith('x-')) continue;
      if (!/^(?:[1-5](?:[0-9]{2}|XX)|default)$/.test(status)) fail('invalid-response-code', path);
      const actual = dereference(response, pointer(path, status));
      if (typeof actual.value.description !== 'string') fail('invalid-response', actual.path);
      const { description, content: media, ...other } = actual.value;
      result.set(status, { content: content(media, pointer(actual.path, 'content')), signature: signature(other), location: loc(actual.path) });
    }
    if (!result.size) fail('invalid-responses', path);
    responseCache.set(raw, result);
    return result;
  }
  const operations = new Map();
  let ordinal = 0;
  for (const [route, rawPath] of Object.entries(document.paths)) {
    if (route.startsWith('x-')) continue;
    const sourcePath = pointer('/paths', route);
    if (!route.startsWith('/')) fail('invalid-path', sourcePath);
    const pathItem = dereference(rawPath, sourcePath);
    if (Object.keys(pathItem.value).some(key => !METHODS.has(key) && !['summary', 'description', 'parameters', 'servers'].includes(key) && !key.startsWith('x-'))) {
      fail('invalid-path-item', pathItem.path);
    }
    const inherited = parameters(pathItem.value.parameters, pointer(pathItem.path, 'parameters'));
    for (const [method, operation] of Object.entries(pathItem.value)) {
      if (!METHODS.has(method)) continue;
      if (++ordinal > LIMITS.operations) fail('operation-limit');
      const path = pointer(pathItem.path, method);
      if (!object(operation)) fail('invalid-operation', path);
      if (own(operation, 'deprecated') && typeof operation.deprecated !== 'boolean') fail('invalid-operation', path);
      const merged = new Map(inherited);
      for (const [key, value] of parameters(operation.parameters, pointer(path, 'parameters'))) merged.set(key, value);
      const other = Object.fromEntries(Object.entries(operation).filter(([key]) =>
        !ANNOTATIONS.has(key) && !['parameters', 'requestBody', 'responses', 'security', 'servers'].includes(key) && !key.startsWith('x-')));
      operations.set(`${method} ${route}`, {
        ordinal, method: method.toUpperCase(), location: loc(path), parameters: merged,
        body: body(operation.requestBody, pointer(path, 'requestBody')),
        responses: responses(operation.responses, pointer(path, 'responses')),
        security: security(own(operation, 'security') ? operation.security : own(document, 'security') ? document.security : [], pointer(path, 'security')),
        servers: signature(operation.servers ?? pathItem.value.servers ?? document.servers ?? []),
        other: signature(other),
      });
    }
  }
  return { operations, source };
}
