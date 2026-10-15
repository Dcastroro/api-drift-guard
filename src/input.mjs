import { open, lstat } from 'node:fs/promises';
import { TextDecoder } from 'node:util';

export const LIMITS = Object.freeze({ bytes: 4194304, nodes: 100000, depth: 96, operations: 2000, references: 200000, locationBytes: 16777216, hashBytes: 67108864, findings: 10000 });
export class ContractError extends Error {
  constructor(code, source, line) {
    super(code);
    this.name = 'ContractError';
    this.code = code;
    this.source = source;
    if (Number.isInteger(line)) this.line = line;
  }
}
export const pointer = (parent, key) => `${parent}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;

/** Strict JSON parsing with duplicate-key detection and source lines, no snippets. */
export function parseContract(text, source = 'input') {
  if (typeof text !== 'string') throw new ContractError('invalid-input', source);
  if (Buffer.byteLength(text, 'utf8') > LIMITS.bytes) throw new ContractError('size-limit', source);
  text = text.replace(/^\uFEFF/, '');
  let index = 0;
  let line = 1;
  let nodes = 0;
  let locationBytes = 0;
  const locations = new Map();
  const fail = code => { throw new ContractError(code, source, line); };
  const whitespace = () => {
    while (index < text.length && /[\x20\t\r\n]/.test(text[index])) {
      if (text[index] === '\n') line += 1;
      index += 1;
    }
  };
  function string() {
    const start = index++;
    while (index < text.length) {
      const char = text[index++];
      if (char === '"') {
        try { return JSON.parse(text.slice(start, index)); } catch { fail('invalid-json'); }
      }
      if (char === '\\') index += 1;
      else if (char.charCodeAt(0) < 32) fail('invalid-json');
    }
    fail('invalid-json');
  }
  function value(path, depth) {
    whitespace();
    if (++nodes > LIMITS.nodes) fail('node-limit');
    if (depth > LIMITS.depth) fail('depth-limit');
    locationBytes += Buffer.byteLength(path, 'utf8');
    if (locationBytes > LIMITS.locationBytes) fail('location-limit');
    locations.set(path, line);
    const char = text[index];
    if (char === '"') return string();
    if (char === '{') {
      index += 1;
      const result = Object.create(null);
      whitespace();
      if (text[index] === '}') { index += 1; return result; }
      while (index < text.length) {
        whitespace();
        if (text[index] !== '"') fail('invalid-json');
        const key = string();
        if (Object.hasOwn(result, key)) fail('duplicate-key');
        whitespace();
        if (text[index++] !== ':') fail('invalid-json');
        result[key] = value(pointer(path, key), depth + 1);
        whitespace();
        const separator = text[index++];
        if (separator === '}') return result;
        if (separator !== ',') fail('invalid-json');
      }
      fail('invalid-json');
    }
    if (char === '[') {
      index += 1;
      const result = [];
      whitespace();
      if (text[index] === ']') { index += 1; return result; }
      while (index < text.length) {
        result.push(value(pointer(path, result.length), depth + 1));
        whitespace();
        const separator = text[index++];
        if (separator === ']') return result;
        if (separator !== ',') fail('invalid-json');
      }
      fail('invalid-json');
    }
    for (const [token, literal] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(token, index)) { index += token.length; return literal; }
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(index));
    if (number) {
      index += number[0].length;
      const result = Number(number[0]);
      if (!Number.isFinite(result)) fail('invalid-number');
      return result;
    }
    fail('invalid-json');
  }
  const document = value('', 0);
  whitespace();
  if (index !== text.length) fail('invalid-json');
  return { document, source, locations };
}

export async function readContract(path, source) {
  let handle;
  try {
    // Reject known special files before opening (including symbolic links).
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size > LIMITS.bytes) throw new ContractError('read-input', source);
    handle = await open(path, 'r');
    if (!(await handle.stat()).isFile()) throw new ContractError('read-input', source);
    const buffer = Buffer.alloc(LIMITS.bytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > LIMITS.bytes) throw new ContractError('size-limit', source);
    const text = new TextDecoder('utf8', { fatal: true }).decode(buffer.subarray(0, length));
    return parseContract(text, source);
  } catch (error) {
    if (error instanceof ContractError) throw error;
    throw new ContractError('read-input', source);
  } finally { await handle?.close(); }
}
