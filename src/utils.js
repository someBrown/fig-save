import ora from 'ora';

import { readJsonSync, pathExistsSync, outputJsonSync } from 'fs-extra/esm';

export const promisePool = async (functions, n) => {
  const concurrency = Math.min(n, functions.length);
  const replicatedFunctions = [...functions];
  const result = await Promise.all(
    Array(concurrency)
      .fill(0)
      .map(async () => {
        const result = [];
        while (replicatedFunctions.length) {
          // const res = await replicatedFunctions.shift()();
          // result.push(res);
          try {
            const res = await replicatedFunctions.shift()();
            result.push({
              status: 'fulfilled',
              value: res,
            });
          } catch (e) {
            console.log(e);
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

export const filterObject = (Obj, filter) =>
  Object.fromEntries(Object.entries(Obj).filter(filter));

export const getMetadata = (path) => {
  return (pathExistsSync(path) && readJsonSync(path)) || {};
};

export const writeMetadata = (path, metadata) => {
  outputJsonSync(path, metadata);
};

export const resolveParamsFromUrl = (url) => {
  const urlObj = new URL(url);
  const regex = /file\/([-\w]+)\//;
  const match = urlObj.pathname.match(regex);
  let key;
  if (match) {
    key = match[1];
  }
  const id = urlObj.searchParams.get('node-id');
  return {
    key,
    id,
  };
};
