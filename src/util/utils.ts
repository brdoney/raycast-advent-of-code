/**
 * Collect the values of an async generator into an array for easy use with
 * `.map`, `.filter`, etc.
 * @template T - type yielded by async generator
 * @param f - The async generator function to collect values from
 * @returns values from the async generator collected into an array
 */
export async function toArray<T>(f: AsyncGenerator<T>): Promise<T[]> {
  const res = [];
  for await (const x of f) {
    res.push(x);
  }
  return res;
}
