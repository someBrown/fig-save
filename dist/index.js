import path from 'path';
import picocolors from 'picocolors';
import { merge } from 'webpack-merge';
import { mkdirsSync, pathExistsSync, readJsonSync, outputJsonSync, removeSync } from 'fs-extra/esm';
import fs from 'fs';
import ora from 'ora';
import cliProgress from 'cli-progress';
import https from 'https';
import * as Figma from 'figma-api';
import findCacheDirectory from 'find-cache-dir';
import inquirer from 'inquirer';
import { readPackage } from 'read-pkg';

const promisePool = async (functions, n) => {
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
const showLoading = async (promise, options) => {
  const spinner = ora(options).start();
  try {
    return await promise;
  } catch (e) {
    return Promise.reject(e);
  } finally {
    spinner.stop();
  }
};

const useProgressBar = () => {
  const progressBar = new cliProgress.SingleBar({
    format: ' {bar} | {percentage}% | {value}/{total}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    stopOnComplete: true,
    clearOnComplete: true,
  });
  return { progressBar };
};

const EVENTS = {
  DATA: 'data',
  END: 'end',
  ERROR: 'error',
};
const FIGMA_API_TYPE = {
  GET_FILE_NODES: 'getFileNodes',
  GET_IMAGE: 'getImage',
};
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const CURRENT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DOWNLOAD_OPTIONS = {
  format: 'png',
  scale: 1,
  figmaImgTypes: ['FRAME', 'COMPONENT'],
  concurrency: 5,
  saveDir: path.resolve(process.cwd(), './imgs'),
};
const TOKEN_FILE_NAME = 'token.json';
const METADATA_FILE_NAME = 'metadata.json';

const useDownload = ({ id, url, saveDir, filename, onComplete }) =>
  new Promise((resolve, reject) => {
    https.get(url, (res) => {
      mkdirsSync(saveDir);
      const fileStream = fs.createWriteStream(`${saveDir}/${filename}`);
      res.pipe(fileStream);
      res.on(EVENTS.END, () => {
        onComplete();
        resolve(id);
      });
      res.on(EVENTS.ERROR, () => {
        reject();
      });
    });
  });

let figmaApi$1 = null;
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
const useFigmaApi = async () => {
  if (!figmaApi$1) {
    const token = await getToken();
    const _figmaAPi = new Figma.Api({
      personalAccessToken: token,
    });
    figmaApi$1 = async (type, ...rest) => {
      try {
        return await _figmaAPi[type](...rest);
      } catch (e) {
        handleError(e);
        return Promise.reject(e);
      }
    };
  }
  return figmaApi$1;
};

let figmaApi;
let mergedOptions = {};
const getMetadataFilePath = () =>
  path.join(mergedOptions.saveDir, METADATA_FILE_NAME);
const getImgUrlsInfo = async (key, id) => {
  const fileInfo = await showLoading(
    figmaApi(FIGMA_API_TYPE.GET_FILE_NODES, key, [id]),
    {
      suffixText: '🐢',
      text: 'Waiting for Figma to parse the file...',
    },
  );
  const children = fileInfo.nodes[id].document.children;
  const imgNamesMap = children
    .filter((child) => mergedOptions.figmaImgTypes.includes(child.type))
    .reduce((acc, cur) => {
      acc[cur.id] = cur.name;
      return acc;
    }, {});
  const { err, images: imgUrls } = await showLoading(
    figmaApi(FIGMA_API_TYPE.GET_IMAGE, key, {
      ids: Object.keys(imgNamesMap),
      ...mergedOptions,
    }),
    {
      suffixText: '🐰',
      text: 'Waiting for Figma to match the images...',
    },
  );
  if (err) {
    throw err;
  }
  const imgUrlsInfo = Object.keys(imgUrls).reduce((acc, id) => {
    acc[id] = {
      url: imgUrls[id],
      name: imgNamesMap[id],
    };
    return acc;
  }, {});
  return imgUrlsInfo;
};
const handleSucceedResult = (succeedCollections, totalImgUrlsInfo) => {
  const metadata = succeedCollections.reduce((acc, item) => {
    acc[item.value] = {
      shouldDownload: false,
      url: totalImgUrlsInfo[item.value].url,
      name: totalImgUrlsInfo[item.value].name,
    };
    return acc;
  }, {});
  const metadataFilePath = getMetadataFilePath();
  const existedMetadata =
    (pathExistsSync(metadataFilePath) && readJsonSync(metadataFilePath)) || {};
  const mergedMetadata = merge(existedMetadata, metadata);
  outputJsonSync(metadataFilePath, mergedMetadata);
};
const handleFailedResult = (succeedCollections, totalImgUrlsInfo) => {
  const succeedIdsMap = succeedCollections.reduce((acc, item) => {
    acc[item.value] = true;
    return acc;
  }, {});
  const failedCollections = Object.keys(totalImgUrlsInfo)
    .filter((id) => !succeedIdsMap[id])
    .map((id) => ({
      url: totalImgUrlsInfo[id].url,
      name: totalImgUrlsInfo[id].name,
    }));
  if (!failedCollections.length) {
    return;
  }
  console.log(
    picocolors.bold(
      picocolors.white(
        `Something Failed.Perhaps you can download it manually at the following URLs 🔧`,
      ),
    ),
  );
  failedCollections.forEach((info) => {
    console.log(
      picocolors.bold(picocolors.red(`${info.name}`)),
      '🔗🔗🔗',
      picocolors.red(`${info.url}`),
    );
  });
};
const handleResult = (result, totalImgUrlsInfo) => {
  const succeedCollections = result.filter(
    (item) => item.status === 'fulfilled',
  );
  handleSucceedResult(succeedCollections, totalImgUrlsInfo);
  handleFailedResult(succeedCollections, totalImgUrlsInfo);
};
const shouldDownload = ([id]) => {
  const metadata =
    (pathExistsSync(getMetadataFilePath()) &&
      readJsonSync(getMetadataFilePath())) ||
    {};
  const curInfo = metadata[id];
  if (!curInfo) {
    return true;
  }
  const saveDir = mergedOptions.saveDir;
  const filename = `${curInfo.name}.${mergedOptions.format}`;
  const filePath = `${saveDir}/${filename}`;
  if (!pathExistsSync(filePath) && shouldDownload) {
    return true;
  }
  return false;
};
const resolveParamsFromUrl = (url) => {
  const urlObj = new URL(url);
  const regex = /file\/([-\w]+)\//;
  const match = urlObj.pathname.match(regex);
  let key;
  if (match) {
    key = match[1];
  }
  const id = urlObj.searchParams.get('node-id');
  if (key && id) {
    return {
      key,
      id,
    };
  } else {
    throw new Error('Failure to parse parameters from URL');
  }
};
const saveImgs = async (url, options = {}) => {
  try {
    const { key, id } = resolveParamsFromUrl(decodeURIComponent(url));
    mergedOptions = merge(DEFAULT_DOWNLOAD_OPTIONS, options);
    figmaApi = await useFigmaApi();
    const imgUrlsInfo = await getImgUrlsInfo(key, id);
    const shouldDownloadImgUrls =
      Object.entries(imgUrlsInfo).filter(shouldDownload);
    if (!shouldDownloadImgUrls.length) {
      console.log('\n' + picocolors.green('Done🎉'));
      return;
    }
    const { progressBar } = useProgressBar(shouldDownloadImgUrls.length);
    progressBar.start(shouldDownloadImgUrls.length, 0);
    const promises = shouldDownloadImgUrls.map(([id, { url, name }]) => () => {
      const saveDir = mergedOptions.saveDir;
      const filename = `${name}.${mergedOptions.format}`;
      return useDownload({
        id,
        url,
        saveDir,
        filename,
        onComplete: progressBar.increment.bind(progressBar),
      });
    });
    const result = await promisePool(promises, mergedOptions.concurrency);
    const shouldDownloadImgUrlsInfo = shouldDownloadImgUrls.reduce(
      (acc, [id, value]) => {
        acc[id] = value;
        return acc;
      },
      {},
    );
    handleResult(result, shouldDownloadImgUrlsInfo);
    console.log('\n' + picocolors.green('Done🎉'));
  } catch (err) {
    if (!err.isAxiosError) {
      console.log(err);
    }
  }
};

export { saveImgs as default, saveImgs };
