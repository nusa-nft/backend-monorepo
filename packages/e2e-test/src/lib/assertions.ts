export function assert(isTrue, errMsg?) {
  if (!isTrue) {
    throw new Error(errMsg);
  }
}