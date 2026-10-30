/** Reject duplicate names and excessive depth before the native JSON parser runs. */
export function parseStrictJson(raw: string, maxDepth = 16): unknown {
  let at = 0;
  const white = (): void => { while (/\s/.test(raw[at] ?? '') && at < raw.length) at++; };
  const string = (): string => {
    const start = at++; let escape = false;
    while (at < raw.length) {
      const char = raw[at++];
      if (!escape && char === '"') return JSON.parse(raw.slice(start, at)) as string;
      if (!escape && char === '\\') escape = true; else escape = false;
    }
    throw new SyntaxError('Unterminated JSON string.');
  };
  const value = (depth: number): void => {
    if (depth > maxDepth) throw new SyntaxError('JSON nesting exceeds the limit.');
    white(); const char = raw[at];
    if (char === '"') { string(); return; }
    if (char === '{') {
      at++; white(); if (raw[at] === '}') { at++; return; }
      const names = new Set<string>();
      while (at < raw.length) {
        white(); if (raw[at] !== '"') throw new SyntaxError('Expected a JSON property name.');
        const name = string(); if (names.has(name)) throw new SyntaxError('Duplicate JSON property.'); names.add(name);
        white(); if (raw[at++] !== ':') throw new SyntaxError('Expected a property separator.'); value(depth + 1); white();
        const end = raw[at++]; if (end === '}') return; if (end !== ',') throw new SyntaxError('Expected a JSON object separator.');
      }
      throw new SyntaxError('Unterminated JSON object.');
    }
    if (char === '[') {
      at++; white(); if (raw[at] === ']') { at++; return; }
      while (at < raw.length) { value(depth + 1); white(); const end = raw[at++]; if (end === ']') return; if (end !== ',') throw new SyntaxError('Expected a JSON array separator.'); }
      throw new SyntaxError('Unterminated JSON array.');
    }
    const start = at; while (at < raw.length && !/[\s,\]}]/.test(raw[at] ?? '')) at++;
    if (start === at) throw new SyntaxError('Expected a JSON value.');
  };
  value(0); white(); if (at !== raw.length) throw new SyntaxError('Trailing JSON content.');
  return JSON.parse(raw) as unknown;
}
export function jsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected a JSON object.');
  return value as Record<string, unknown>;
}
