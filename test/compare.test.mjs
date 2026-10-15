import test from 'node:test';
import assert from 'node:assert/strict';
import { compareContracts, LIMITS } from '../src/index.mjs';
import { formatReport } from '../src/report.mjs';
const response = () => ({ description: 'Fictional response' });
const operation = extra => ({ responses: { 200: response() }, ...extra });
const contract = paths => ({ openapi: '3.1.0', info: { title: 'Fictional API', version: '1' }, paths });
const doc = op => contract({ '/items': { get: op } });
const compare = (base, head, options) => compareContracts(JSON.stringify(base, null, 2), JSON.stringify(head, null, 2), options);
const codes = report => report.findings.map(finding => finding.code);
const param = (required = false) => ({ name: 'region', in: 'query', required, schema: { type: 'string' } });
const body = (required = false) => ({ required, content: { 'application/json': { schema: { type: 'string' } } } });

test('identical documents produce no findings and pass', () => {
  const base = doc(operation());
  const report = compare(base, base);
  assert.equal(report.ok, true);
  assert.deepEqual(report.summary, { breaking: 0, review: 0, addition: 0 });
});

test('endpoint removal blocks the gate; endpoint addition passes', () => {
  assert.deepEqual(codes(compare(doc(operation()), contract({}))), ['operation-removed']);
  const added = compare(contract({}), doc(operation()));
  assert.deepEqual(codes(added), ['operation-added']);
  assert.equal(added.ok, true);
});

test('new required parameters and optional-to-required changes break', () => {
  assert.deepEqual(codes(compare(doc(operation()), doc(operation({ parameters: [param(true)] })))), ['required-parameter-added']);
  const report = compare(doc(operation({ parameters: [param()] })), doc(operation({ parameters: [param(true)] })));
  assert.deepEqual(codes(report), ['parameter-now-required']);
  assert.equal(report.ok, false);
});

test('optional additions and required-to-optional changes are additions', () => {
  assert.equal(compare(doc(operation()), doc(operation({ parameters: [param()] }))).ok, true);
  assert.deepEqual(codes(compare(doc(operation({ parameters: [param(true)] })), doc(operation({ parameters: [param()] })))), ['parameter-now-optional']);
});

test('parameter removal and structural schema changes require review', () => {
  const base = doc(operation({ parameters: [param()] }));
  assert.deepEqual(codes(compare(base, doc(operation()))), ['parameter-removed']);
  const head = structuredClone(base);
  head.paths['/items'].get.parameters[0].schema.enum = ['north'];
  const result = compare(base, head);
  assert.deepEqual(codes(result), ['parameter-shape-changed']);
  assert.equal(result.ok, false);
  assert.equal(compare(base, head, { allowReview: true }).ok, true);
});

test('path parameters are inherited and operation parameters override them', () => {
  const base = doc(operation({ parameters: [param()] }));
  base.paths['/items'].parameters = [param(true)];
  const head = structuredClone(base);
  delete head.paths['/items'].get.parameters;
  assert.deepEqual(codes(compare(base, head)), ['parameter-now-required']);
});

test('header names match case-insensitively; query names remain case-sensitive', () => {
  const base = doc(operation({ parameters: [{ ...param(), name: 'X-Region', in: 'header' }] }));
  const head = structuredClone(base);
  head.paths['/items'].get.parameters[0].name = 'x-region';
  assert.deepEqual(codes(compare(base, head)), []);
  head.paths['/items'].get.parameters[0].in = 'query';
  assert.deepEqual(codes(compare(base, head)), ['parameter-removed', 'optional-parameter-added']);
});

test('required body additions and changes block; optional additions pass', () => {
  assert.deepEqual(codes(compare(doc(operation()), doc(operation({ requestBody: body(true) })))), ['required-body-added']);
  assert.equal(compare(doc(operation()), doc(operation({ requestBody: body() }))).ok, true);
  assert.deepEqual(codes(compare(doc(operation({ requestBody: body() })), doc(operation({ requestBody: body(true) })))), ['body-now-required']);
  assert.deepEqual(codes(compare(doc(operation({ requestBody: body(true) })), doc(operation({ requestBody: body() })))), ['body-now-optional']);
  assert.deepEqual(codes(compare(doc(operation({ requestBody: body() })), doc(operation()))), ['request-body-removed']);
});

test('removed request/response media blocks even when review is allowed', () => {
  const base = doc(operation({ requestBody: body() }));
  const head = structuredClone(base);
  head.paths['/items'].get.requestBody.content = { 'text/plain': { schema: { type: 'string' } } };
  const report = compare(base, head, { allowReview: true });
  assert.equal(report.ok, false);
  assert.deepEqual(codes(report), ['request-media-removed', 'request-media-added']);
  const output = doc(operation({ responses: { 200: { ...response(), content: body().content } } }));
  assert.ok(codes(compare(output, doc(operation()))).includes('response-media-removed'));
});

test('response additions, removals, headers and schemas require review', () => {
  const base = doc(operation());
  const head = doc(operation({ responses: { 201: response() } }));
  assert.deepEqual(codes(compare(base, head)), ['response-removed', 'response-added']);
  head.paths['/items'].get.responses = { 200: { ...response(), headers: { 'X-Trace': { schema: { type: 'string' } } } } };
  assert.deepEqual(codes(compare(base, head)), ['response-metadata-changed']);
});

test('root security is inherited; operation overrides avoid unrelated root findings', () => {
  const base = doc(operation());
  const head = structuredClone(base);
  head.security = [{ demoAuth: [] }];
  head.components = { securitySchemes: { demoAuth: { type: 'http', scheme: 'basic' } } };
  assert.deepEqual(codes(compare(base, head)), ['security-changed']);
  base.paths['/items'].get.security = [];
  head.paths['/items'].get.security = [];
  assert.deepEqual(codes(compare(base, head)), []);
});

test('a security scheme definition change is detected even when requirements keep the same name', () => {
  const base = doc(operation());
  base.security = [{ demoAuth: [] }];
  base.components = { securitySchemes: { demoAuth: { type: 'http', scheme: 'basic' } } };
  const head = structuredClone(base);
  head.components.securitySchemes.demoAuth.scheme = 'bearer';
  assert.deepEqual(codes(compare(base, head)), ['security-changed']);
});

test('missing security schemes and non-boolean review policies fail closed', () => {
  const base = doc(operation({ security: [{ missing: [] }] }));
  assert.throws(() => compare(base, base), /unresolved-security-scheme/);
  assert.throws(() => compare(doc(operation()), doc(operation()), { allowReview: 'false' }), /invalid-policy/);
});

test('server changes and operation identifiers require review', () => {
  const base = doc(operation());
  const head = structuredClone(base);
  head.servers = [{ url: 'https://fictional.invalid' }];
  assert.deepEqual(codes(compare(base, head)), ['servers-changed']);
  delete head.servers;
  head.paths['/items'].get.operationId = 'listDemo';
  assert.deepEqual(codes(compare(base, head)), ['operation-metadata-changed']);
});

test('ordinary operation/response descriptions and object-key order do not cause findings', () => {
  const base = doc(operation({ description: 'First' }));
  const head = structuredClone(base);
  head.info.version = '2';
  head.paths['/items'].get.description = 'Second';
  head.paths['/items'].get.responses[200].description = 'Updated documentation';
  head.paths['/items'].get.responses[200] = { description: head.paths['/items'].get.responses[200].description };
  assert.deepEqual(codes(compare(base, head)), []);
});

test('same $ref pointer with a changed component is detected', () => {
  const base = doc(operation({ requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } } } }));
  base.components = { schemas: { Item: { type: 'object', properties: { name: { type: 'string' } } } } };
  const head = structuredClone(base);
  head.components.schemas.Item.properties.name.type = 'integer';
  assert.deepEqual(codes(compare(base, head)), ['request-schema-changed']);
});

test('recursive schema references terminate and detect changes beyond the cycle', () => {
  const base = doc(operation({ requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Node' } } } } }));
  base.components = { schemas: { Node: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' }, name: { type: 'string' } } } } };
  assert.equal(compare(base, base).ok, true);
  const head = structuredClone(base);
  head.components.schemas.Node.properties.name.type = 'integer';
  assert.deepEqual(codes(compare(base, head)), ['request-schema-changed']);
});

test('resolves escaped JSON Pointer references and operation-level parameter overrides', () => {
  const base = doc(operation({ parameters: [{ $ref: '#/components/parameters/a~1b~0c' }] }));
  base.components = { parameters: { 'a/b~c': param() } };
  const head = structuredClone(base);
  head.components.parameters['a/b~c'].required = true;
  assert.deepEqual(codes(compare(base, head)), ['parameter-now-required']);
});

test('external, dangling and cyclic non-schema refs fail closed without URL output', () => {
  for (const ref of ['https://PRIVATE_SENTINEL.invalid/private', '#/missing', '#/%ZZ']) {
    const base = doc(operation({ parameters: [{ $ref: ref }] }));
    assert.throws(() => compare(base, base), error => !JSON.stringify(error).includes('PRIVATE_SENTINEL'));
  }
  const base = doc(operation({ parameters: [{ $ref: '#/components/parameters/Loop' }] }));
  base.components = { parameters: { Loop: { $ref: '#/components/parameters/Loop' } } };
  assert.throws(() => compare(base, base), /cyclic-object-ref/);
});

test('rejects invalid parameter lists and path parameter requirements', () => {
  for (const parameters of [[param(), param()], [{ ...param(), in: 'path' }], [{ ...param(), required: 'yes' }], {}]) {
    const base = doc(operation({ parameters }));
    assert.throws(() => compare(base, base));
  }
});

test('unsupported versions, webhooks and schema resolution are explicit errors', () => {
  for (const patch of [{ openapi: '3.2.0' }, { webhooks: {} }, { jsonSchemaDialect: 'custom' }, { components: { schemas: { Demo: { $id: 'custom' } } } }, { components: { schemas: { Demo: { $schema: 'custom' } } } }]) {
    const base = { ...doc(operation()), ...patch };
    assert.throws(() => compare(base, base));
  }
  const base30 = { ...doc(operation()), openapi: '3.0.4' };
  assert.equal(compare(base30, base30).ok, true);
});

test('all report formats omit sensitive routes, names, URLs, examples and values', () => {
  const secret = 'PRIVATE_SENTINEL_7f4c19';
  const base = contract({ [`/${secret}`]: { get: operation({ requestBody: body() }) } });
  const head = structuredClone(base);
  head.paths[`/${secret}`].get.parameters = [{ ...param(true), name: secret, example: secret }];
  head.paths[`/${secret}`].get.requestBody.content['application/json'].example = { private: secret };
  head.servers = [{ url: `https://${secret}.invalid` }];
  const result = compare(base, head);
  for (const format of ['text', 'json', 'markdown']) assert.equal(formatReport(result, format).includes(secret), false);
});

test('scales to 1500 operations sharing a component without expanding copies', () => {
  const paths = {};
  for (let index = 0; index < 1500; index += 1) paths[`/route${index}`] = { get: operation({ parameters: [{ $ref: '#/components/parameters/Shared' }] }) };
  const base = contract(paths);
  base.components = { parameters: { Shared: param() } };
  const result = compare(base, base);
  assert.equal(result.operations.base, 1500);
  assert.equal(result.ok, true);
});

test('rejects operation counts beyond the documented bound', () => {
  const base = contract(Object.fromEntries(Array.from({ length: LIMITS.operations + 1 }, (_, index) => [`/r${index}`, { get: operation() }])));
  assert.throws(() => compare(base, base), /operation-limit/);
});

test('bounds report volume rather than silently truncating findings', () => {
  const paths = {};
  for (let index = 0; index < 1100; index += 1) paths[`/r${index}`] = { get: operation() };
  const base = contract(paths);
  const head = structuredClone(base);
  for (const path of Object.values(head.paths)) {
    path.get.parameters = Array.from({ length: 10 }, (_, index) => ({ name: `q${index}`, in: 'query' }));
  }
  assert.throws(() => compare(base, head), /finding-limit/);
});

test('cyclic reference fingerprints ignore object property order', () => {
  const base = doc(operation({ requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/A' } } } } }));
  base.components = { schemas: { A: { type: 'object', properties: { next: { $ref: '#/components/schemas/B' } } }, B: { type: 'object', properties: { next: { $ref: '#/components/schemas/A' } } } } };
  const head = structuredClone(base);
  head.components.schemas = { B: head.components.schemas.B, A: head.components.schemas.A };
  assert.deepEqual(codes(compare(base, head)), []);
});
