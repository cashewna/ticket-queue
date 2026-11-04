const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/** Marks a string as already-safe HTML. Never pass user input here. */
export class SafeHtml {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }
}

export function raw(value: string): SafeHtml {
  return new SafeHtml(value);
}

function renderValue(value: unknown): string {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(value);
}

/**
 * Tagged template that escapes every interpolated value unless it is already
 * a SafeHtml fragment. Interpolated arrays are joined, so lists of components
 * compose without string concatenation.
 */
export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): SafeHtml {
  let output = '';
  for (let index = 0; index < strings.length; index += 1) {
    output += strings[index] ?? '';
    if (index < values.length) output += renderValue(values[index]);
  }
  return new SafeHtml(output);
}

export function join(values: readonly unknown[], separator = ''): SafeHtml {
  return new SafeHtml(values.map(renderValue).join(separator));
}
