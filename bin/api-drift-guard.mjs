#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { readContract, ContractError } from '../src/input.mjs';
import { compareParsed } from '../src/index.mjs';
import { formatReport } from '../src/report.mjs';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const HELP = `API Drift Guard ${VERSION}

Usage: node bin/api-drift-guard.mjs --base <old.json> --head <new.json> [options]

  --format <text|json|markdown>  Output format (default: text)
  --allow-review               Allow review-only changes to pass; breaking changes still fail
  --help                       Show usage
  --version                    Show version

Exit codes: 0 gate passed, 1 findings block the gate, 2 invalid/unsupported input.
Reports use file labels and line numbers. Raw names, URLs, examples and values are excluded.
Inputs stay local. No credentials, network requests or command execution.
`;

function parseArgs(args) {
  const options = { format: 'text', allowReview: false };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (seen.has(flag)) throw new ContractError('usage');
    seen.add(flag);
    if (flag === '--help' || flag === '--version') options[flag.slice(2)] = true;
    else if (flag === '--allow-review') options.allowReview = true;
    else if (['--base', '--head', '--format'].includes(flag)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new ContractError('usage');
      options[flag.slice(2)] = value;
    } else throw new ContractError('usage');
  }
  if (!['text', 'json', 'markdown'].includes(options.format)) throw new ContractError('usage');
  if (!options.help && !options.version && (!options.base || !options.head)) throw new ContractError('usage');
  return options;
}
async function main() {
  const args = process.argv.slice(2);
  let options;
  try {
    options = parseArgs(args);
    if (options.help) { console.log(HELP); return; }
    if (options.version) { console.log(VERSION); return; }
    const base = await readContract(options.base, 'base');
    const head = await readContract(options.head, 'head');
    const report = compareParsed(base, head, options);
    console.log(formatReport(report, options.format));
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    const detail = error instanceof ContractError ? error : new ContractError('internal');
    const report = { version: 1, ok: false, error: { code: detail.code,
      ...(detail.source ? { source: detail.source } : {}), ...(detail.line ? { line: detail.line } : {}) } };
    // Use the explicit format even when a different argument is malformed.
    const formatIndex = args.indexOf('--format');
    const json = options?.format === 'json' || (formatIndex >= 0 && args[formatIndex + 1] === 'json');
    if (json) console.log(JSON.stringify(report, null, 2));
    else console.error(`ERROR: ${report.error.code}${detail.source ? ` [${detail.source}${detail.line ? `:${detail.line}` : ''}]` : ''}.`);
    process.exitCode = 2;
  }
}
await main();
