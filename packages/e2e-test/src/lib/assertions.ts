import chalk from "chalk";

export function assert(isTrue, errMsg?) {
  if (!isTrue) {
    throw new Error(errMsg);
  }
}

export function fmtSuccess(msg: string) {
  return chalk.green(`✅ ${msg}`);
}

export function fmtFailed(msg: string) {
  return chalk.red(`❌ ${msg}`);
}