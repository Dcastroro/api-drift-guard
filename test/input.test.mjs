import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContract, LIMITS, ContractError } from '../src/input.mjs';

test('parses JSON values and escaped pointer keys with accurate source lines', () => {
  const text = '\uFEFF{\n  "a/b~c": [true,false,null,1.25e2,"escaped \\" quote"]\n}';
  const context = parseContract(text, 'base');
  assert.deepEqual([...context.document['a/b~c']], [true, false, null, 125, 'escaped " quote']);
  assert.equal(context.locations.get('/a~1b~0c/0'), 2);
});

test('does not mutate object prototypes', () => {
  const context = parseContract('{"__proto__":{"polluted":true},"constructor":1}');
  assert.equal(Object.getPrototypeOf(context.document), null);
  assert.equal({}.polluted, undefined);
  assert.equal(context.document.__proto__.polluted, true);
});

for (const text of ['', '{', '[1,]', '{"a":1,}', '01', 'true false', '"\n"', '1e9999', '{"x":1,"x":2}', '"\\uZZZZ"']) {
  test(`rejects malformed or ambiguous JSON case ${Buffer.from(text).toString('hex')}`, () => {
    assert.throws(() => parseContract(text), ContractError);
  });
}

test('diagnostics contain codes and line numbers without input snippets', () => {
  const marker = 'PRIVATE_SENTINEL_INPUT';
  try { parseContract(`{\n"x":"${marker}",\n broken}`, 'head'); assert.fail(); }
  catch (error) {
    assert.equal(error.source, 'head');
    assert.equal(error.line, 3);
    assert.equal(JSON.stringify(error).includes(marker), false);
    assert.equal(error.message.includes(marker), false);
  }
});

test('enforces byte, node and depth limits', () => {
  assert.throws(() => parseContract(' '.repeat(LIMITS.bytes + 1)), /size-limit/);
  assert.throws(() => parseContract('['.repeat(100) + '0' + ']'.repeat(100)), /depth-limit/);
  assert.throws(() => parseContract('[' + Array(100001).fill('0').join(',') + ']'), /node-limit/);
});

test('accepts normal BOM/CRLF JSON and rejects non-JSON whitespace', () => {
  assert.equal(parseContract('\uFEFF{\r\n"a":1\r\n}').locations.get('/a'), 2);
  assert.throws(() => parseContract('\u00a0{}'), /invalid-json/);
});

test('bounds cumulative source-pointer storage for deeply nested long keys', () => {
  const input = JSON.stringify({ ['k'.repeat(1048576)]: JSON.parse('['.repeat(20) + '0' + ']'.repeat(20)) });
  assert.throws(() => parseContract(input), /location-limit/);
});
