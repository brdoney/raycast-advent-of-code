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

/**
 * Remove keys from an object, for example to reset form values while setting
 * only some initial values.
 * @template T extends object - object type to remove keys from
 * @param obj - object to remove keys from
 * @param keys - keys to remove from the object
 * @returns a copy of obj with the corresponding keys removed
 */
export function removeKeys<T extends object>(obj: T, ...keys: (keyof T)[]) {
  const copy = { ...obj };
  for (const key of keys) {
    delete copy[key];
  }
  return copy;
}
