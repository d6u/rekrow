export default function settlePromise(iterable: Iterable<any>) {
  const arr: Promise<any>[] = [];
  for (const promise of iterable) {
    arr.push(promise.catch(() => {}));
  }
  return Promise.all(arr);
}
