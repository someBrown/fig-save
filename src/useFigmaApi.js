import * as Figma from 'figma-api';
import findCacheDirectory from 'find-cache-dir';
import inquirer from 'inquirer';
import { readPackage } from 'read-pkg';
import { TOKEN_FILE_NAME, CURRENT_ROOT } from './const.js';
import {
  outputJsonSync,
  readJsonSync,
  removeSync,
  pathExistsSync,
} from 'fs-extra/esm';
import picocolors from 'picocolors';

let figmaApi = null;

const getTokenFilePath = async () => {
  const { name } = await readPackage({ cwd: CURRENT_ROOT });
  const thunk = findCacheDirectory({ name, create: true, thunk: true });
  return thunk(TOKEN_FILE_NAME);
};

const getToken = async () => {
  const tokenPath = await getTokenFilePath();
  try {
    const token = pathExistsSync(tokenPath) && readJsonSync(tokenPath);
    if (!token) throw new Error();
    return token;
  } catch (e) {
    const { token } = await inquirer.prompt({
      type: 'input',
      name: 'token',
      message: 'Please Enter Your Figma Token',
    });
    outputJsonSync(tokenPath, token);
    return token;
  }
};

const deleteToken = async () => {
  const tokenPath = await getTokenFilePath();
  removeSync(tokenPath);
};

const handleError = (err) => {
  if (err.isAxiosError) {
    const resData = err?.response?.data || {};
    if (resData.status === 403) {
      deleteToken();
    }
    console.log(`\n${picocolors.red(resData.err)}`);
  }
};

export const useFigmaApi = async () => {
  if (!figmaApi) {
    // 获取token
    const token = await getToken();
    const _figmaAPi = new Figma.Api({
      personalAccessToken: token,
    });
    figmaApi = async (type, ...rest) => {
      try {
        return await _figmaAPi[type](...rest);
      } catch (e) {
        handleError(e);
        return Promise.reject(e);
      }
    };
  }

  return figmaApi;
};
