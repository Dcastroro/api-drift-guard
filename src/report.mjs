const location = value => value ? `${value.source}${value.line ? `:${value.line}` : ''}` : '-';
export function formatReport(report, format = 'text') {
  if (format === 'json') return JSON.stringify(report, null, 2);
  if (format === 'markdown') {
    return [
      `## API Drift Guard: ${report.ok ? 'PASS' : 'REVIEW REQUIRED'}`,
      '',
      `Breaking: ${report.summary.breaking} · Review: ${report.summary.review} · Additions: ${report.summary.addition}`,
      '',
      '| # | Severity | Rule | Method | Base line | Head line |',
      '| --- | --- | --- | --- | --- | --- |',
      ...report.findings.map(f => `| ${f.id} | ${f.severity} | ${f.code} | ${f.method} | ${location(f.base)} | ${location(f.head)} |`),
      '',
      'Scope: OpenAPI surface checks and structural schema-change review. This is not a complete compatibility proof.',
    ].join('\n');
  }
  return [
    `${report.ok ? 'PASS' : 'REVIEW REQUIRED'}: ${report.summary.breaking} breaking, ${report.summary.review} review, ${report.summary.addition} addition(s).`,
    ...report.findings.map(f => `  ${f.severity.toUpperCase()} ${f.code} ${f.method} [${location(f.base)} -> ${location(f.head)}]`),
    'Scope: OpenAPI surface checks; passing does not prove full compatibility.',
  ].join('\n');
}
