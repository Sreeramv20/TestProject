import type { Locator } from 'playwright';
import { randomInt } from './random';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function randomDelay(minMs: number, maxMs: number): Promise<void> {
  await sleep(randomInt(minMs, maxMs));
}

export async function humanType(locator: Locator, text: string): Promise<void> {
  for (const character of text) {
    await locator.type(character, { delay: randomInt(35, 160) });
    if (Math.random() < 0.05) {
      await sleep(randomInt(200, 650));
    }
  }
}
