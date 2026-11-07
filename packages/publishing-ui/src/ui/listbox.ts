// Pure helpers shared by Select and Combobox, kept free of the DOM so they can be tested.

export type Choice = {
  value: string;
  label: string;
  /** Secondary text shown beside the label. */
  hint?: string;
  disabled?: boolean;
  /** Options with the same consecutive group are listed under one heading. */
  group?: string;
};

export type Section = {
  label: string;
  items: { choice: Choice; index: number }[];
};

/** Moves the active index by one, skipping disabled options. Wraps only when `wrap` is set. */
export function step(choices: Choice[], from: number, direction: 1 | -1, wrap = false): number {
  const count = choices.length;
  if (!count) return -1;
  let index = from;
  for (let tries = 0; tries < count; tries++) {
    index += direction;
    if (index < 0 || index >= count) {
      if (!wrap) return from;
      index = (index + count) % count;
    }
    if (!choices[index].disabled) return index;
  }
  return from;
}

export function edge(choices: Choice[], end: 'first' | 'last'): number {
  const order = choices.map((_, index) => index);
  if (end === 'last') order.reverse();
  return order.find((index) => !choices[index].disabled) ?? -1;
}

/** Index of the next option whose label starts with the typed text, searching after `from`. */
export function typeahead(choices: Choice[], typed: string, from: number): number {
  const needle = typed.toLowerCase();
  if (!needle) return -1;
  // Repeating one letter cycles through the options that start with it.
  const cycling = [...needle].every((letter) => letter === needle[0]);
  const text = cycling ? needle[0] : needle;
  const count = choices.length;
  for (let offset = cycling ? 1 : 0; offset <= count; offset++) {
    const index = (from + offset + count) % count;
    const choice = choices[index];
    if (choice && !choice.disabled && choice.label.toLowerCase().startsWith(text)) return index;
  }
  return -1;
}

export function sections(choices: Choice[]): Section[] {
  const result: Section[] = [];
  choices.forEach((choice, index) => {
    const label = choice.group ?? '';
    const last = result[result.length - 1];
    if (last && last.label === label) last.items.push({ choice, index });
    else result.push({ label, items: [{ choice, index }] });
  });
  return result;
}

/** The current token of `text`, which is all of it unless a separator is given. */
export function currentToken(text: string, separator?: string): string {
  if (!separator) return text;
  return text.slice(text.lastIndexOf(separator) + separator.length).trim();
}

/** Replaces the current token with a picked value. */
export function replaceToken(text: string, picked: string, separator?: string): string {
  if (!separator) return picked;
  const cut = text.lastIndexOf(separator);
  const kept = cut === -1 ? '' : text.slice(0, cut + separator.length).trimEnd() + ' ';
  return kept + picked;
}

/** Choices that match the typed text by label, value or hint. An empty query keeps everything. */
export function filterChoices(choices: Choice[], query: string, limit = 50): Choice[] {
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? choices.filter((choice) =>
        `${choice.label}\n${choice.value}\n${choice.hint ?? ''}`.toLowerCase().includes(needle)
      )
    : choices;
  return matches.slice(0, limit);
}
