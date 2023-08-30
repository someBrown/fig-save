import path from 'path';
import picocolors from 'picocolors';
import { merge } from 'webpack-merge';
import { outputJsonSync, readJsonSync, pathExistsSync } from 'fs-extra/esm';
import { promisePool, useAsyncWithLoading } from './utils.js';
import { useProgressBar } from './useProgressBar.js';
import { useDownload } from './useDownload.js';
import { useETag } from './useETag.js';
import {
  DEFAULT_DOWNLOAD_OPTIONS,
  METADATA_FILE_NAME,
  FIGMA_API_TYPE,
} from './const.js';
import { useFigmaApi } from './useFigmaApi.js';

let figmaApi;
let mergedOptions = {};

const getMetadataFilePath = () =>
  path.join(mergedOptions.saveDir, METADATA_FILE_NAME);

const getImgUrlsInfo = async (key, id) => {
  const fileInfo = await useAsyncWithLoading(
    figmaApi(FIGMA_API_TYPE.GET_FILE_NODES, key, [id]),
    {
      suffixText: '🐢',
      text: 'Waiting for Figma to parse the file...',
    },
  );
  const children = fileInfo.nodes[id].document.children;
  // id=>名称对应 下载的时候指定名称
  const imgNamesMap = children
    .filter((child) => mergedOptions.figmaImgTypes.includes(child.type))
    .reduce((acc, cur) => {
      acc[cur.id] = cur.name;
      return acc;
    }, {});

  const { err, images: imgUrls } = await useAsyncWithLoading(
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

const getMetadata = () => {
  const metadataFilePath = getMetadataFilePath();
  return (
    (pathExistsSync(metadataFilePath) && readJsonSync(metadataFilePath)) || {}
  );
};

const handleSucceedResult = (succeedCollections, totalImgUrlsInfo) => {
  // 记录成功的数据防止重复下载
  const metadata = succeedCollections.reduce((acc, item) => {
    const { id, eTag } = item.value;
    acc[id] = {
      shouldDownload: true,
      url: totalImgUrlsInfo[id].url,
      name: totalImgUrlsInfo[id].name,
      eTag,
    };
    return acc;
  }, {});

  const metadataFilePath = getMetadataFilePath();
  const existedMetadata = getMetadata();
  const mergedMetadata = merge(existedMetadata, metadata);
  outputJsonSync(metadataFilePath, mergedMetadata);
};

const handleFailedResult = (succeedCollections, totalImgUrlsInfo) => {
  const succeedIdsMap = succeedCollections.reduce((acc, item) => {
    acc[item.value.id] = true;
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
  // 记录成功文件，跳过重复下载
  const succeedCollections = result.filter(
    (item) => item.status === 'fulfilled',
  );
  handleSucceedResult(succeedCollections, totalImgUrlsInfo);
  handleFailedResult(succeedCollections, totalImgUrlsInfo);
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

const getETag = async (imgUrlsInfo) => {
  console.log(picocolors.green('Compare Etag...'));
  const totalNums = Object.keys(imgUrlsInfo).length;
  const { progressBar } = useProgressBar(totalNums);
  progressBar.start(totalNums, 0);
  const promises = Object.entries(imgUrlsInfo).map(([id, { url }]) => () => {
    return useETag({
      id,
      url,
      onComplete: progressBar.increment.bind(progressBar),
    });
  });

  const result = await promisePool(promises, totalNums);

  const eTags = result
    .filter((item) => item.status === 'fulfilled')
    .map((item) => item.value.eTag);

  return { eTags };
};

const filterByMetadata = (metadata) => {
  return ([id]) => {
    const curInfo = metadata[id];
    if (!curInfo) {
      return true;
    }
    return curInfo['shouldDownload'];
  };
};

const filterByTags = (eTags, metadata) => {
  return ([id]) => {
    return !eTags.includes(metadata[id]?.eTag);
  };
};

const saveImgs = async (url, options = {}) => {
  try {
    const { key, id } = resolveParamsFromUrl(decodeURIComponent(url));
    mergedOptions = merge(DEFAULT_DOWNLOAD_OPTIONS, options);
    const metadata = getMetadata(mergedOptions);
    figmaApi = await useFigmaApi();
    let imgUrlsInfo = await getImgUrlsInfo(key, id, getImgUrlsInfo);
    imgUrlsInfo = Object.fromEntries(
      Object.entries(imgUrlsInfo).filter(filterByMetadata(metadata)),
    );
    const { eTags } = await getETag(imgUrlsInfo);
    imgUrlsInfo = Object.fromEntries(
      Object.entries(imgUrlsInfo).filter(filterByTags(eTags, metadata)),
    );
    const sdImgNums = Object.keys(imgUrlsInfo).length;
    if (!sdImgNums) {
      console.log('\n' + picocolors.green('Done🎉'));
      return;
    }

    const { progressBar } = useProgressBar(sdImgNums);
    progressBar.start(sdImgNums, 0);
    const promises = Object.entries(imgUrlsInfo).map(
      ([id, { url, name }]) =>
        () => {
          const saveDir = mergedOptions.saveDir;
          const filename = `${name}.${mergedOptions.format}`;
          return useDownload({
            id,
            url,
            saveDir,
            filename,
            previousEtag: metadata[id]?.eTag,
            onComplete: progressBar.increment.bind(progressBar),
          });
        },
    );
    console.log(picocolors.green('Downloading... 🐢'));
    const result = await promisePool(promises, mergedOptions.concurrency);

    handleResult(result, imgUrlsInfo);
    console.log('\n' + picocolors.green('Done🎉'));
  } catch (err) {
    if (!err.isAxiosError) {
      console.log(err);
    }
  }
};

export { saveImgs };
export default saveImgs;
