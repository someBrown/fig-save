import fs from 'fs';

import ora from 'ora';

export const promisePool = async (functions, n) => {
  const concurrency = Math.min(n, functions.length);
  const replicatedFunctions = [...functions];
  const result = await Promise.all(
    Array(concurrency)
      .fill(0)
      .map(async () => {
        const result = [];
        while (replicatedFunctions.length) {
          try {
            const res = await replicatedFunctions.shift()();
            result.push({
              status: 'fulfilled',
              value: res,
            });
          } catch {
            result.push({
              status: 'rejected',
            });
          }
        }
        return result;
      }),
  );
  return result.flat();
};

export const writeFileSync = (path, data) => {
  try {
    fs.writeFileSync(path, JSON.stringify(data), 'utf-8');
    return true;
  } catch {
    return false;
  }
};

export const readFileSync = (path) => {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
};

export const useAsyncWithLoading = async (promise, options) => {
  const spinner = ora(options).start();
  try {
    return await promise;
  } catch (e) {
    return Promise.reject(e);
  } finally {
    spinner.stop();
  }
};
