export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pickRandom<T>(items: T[]): T {
  if (items.length === 0) {
    throw new Error('Cannot pick a random item from an empty list');
  }
  return items[randomInt(0, items.length - 1)];
}

export function sample<T>(items: T[], count: number): T[] {
  const copy = [...items];
  const selected: T[] = [];
  while (copy.length > 0 && selected.length < count) {
    selected.push(copy.splice(randomInt(0, copy.length - 1), 1)[0]);
  }
  return selected;
}

export function jitter(baseMs: number, percent = 0.3): number {
  const delta = baseMs * percent;
  return Math.max(0, Math.round(baseMs + (Math.random() * delta * 2 - delta)));
}

export function fillTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
