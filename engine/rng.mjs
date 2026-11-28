/**
 * The engine's seeded random-number generator. It lives in its own module so a consumer that only
 * needs dice (the career economy's pack opening) does not pull the whole rules runtime in with it.
 */
export class Rng {
  constructor(seed = 1) { this.seed = Number(seed) || 1; this.state = this.seed >>> 0; }
  next() { this.state = (1664525 * this.state + 1013904223) >>> 0; return this.state / 2 ** 32; }
  pick(array) { return array.length ? array[Math.floor(this.next() * array.length)] : undefined; }
  shuffle(array) { for (let index = array.length - 1; index > 0; index -= 1) { const other = Math.floor(this.next() * (index + 1)); [array[index], array[other]] = [array[other], array[index]]; } return array; }
}
