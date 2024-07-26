import path from 'path';
import picocolors from 'picocolors';
import { merge } from 'webpack-merge';

import {
  promisePool,
  useAsyncWithLoading,
  filterObject,
  getMetadata,
  writeMetadata,
  resolveParamsFromUrl,
} from './utils.js';
import { useProgressBar } from './useProgressBar.js';
import { useDownload } from './useDownload.js';
import { useETag } from './useETag.js';

import {
  DEFAULT_DOWNLOAD_OPTIONS,
  METADATA_FILE_NAME,
  FIGMA_API_TYPE,
} from './const.js';
import { useFigmaApi } from './useFigmaApi.js';

let mergedOptions = {};
let metadataPath = '';

const updateMetadataPath = () => {
  metadataPath = path.join(mergedOptions.saveDir, METADATA_FILE_NAME);
};

const updateMergedOptions = (options) => {
  mergedOptions = merge(DEFAULT_DOWNLOAD_OPTIONS, options);
};

const getImgUrlsInfo = async (key, id) => {
  const figmaApi = await useFigmaApi();
  const fileInfo = await useAsyncWithLoading(
    figmaApi(FIGMA_API_TYPE.GET_FILE_NODES, key, [id]),
    {
      suffixText: '🐢',
      text: 'Waiting for Figma to parse the file...',
    },
  );
  let info = null;
  if (fileInfo.nodes[id]) {
    info = fileInfo.nodes[id];
  } else {
    info = fileInfo.nodes[id.replace('-', ':')];
  }
  const children = info.document.children;
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

  const existedMetadata = getMetadata(metadataPath);
  const mergedMetadata = merge(existedMetadata, metadata);
  writeMetadata(metadataPath, mergedMetadata);
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

const getETag = async (imgUrlsInfo) => {
  console.log(picocolors.green('Compare Etag...'));
  const entries = Object.entries(imgUrlsInfo);
  const totalNums = entries.length;
  const { progressBar } = useProgressBar(totalNums);
  progressBar.start(totalNums, 0);
  const promises = entries.map(
    ([id, { url }]) =>
      () =>
        useETag({
          id,
          url,
          onComplete: progressBar.increment.bind(progressBar),
        }),
  );

  const result = await promisePool(promises, totalNums);
  return result
    .filter((item) => item.status === 'fulfilled')
    .map((item) => item.value?.eTag);
};

const createMetadataFilter =
  (metadata) =>
  ([id]) => {
    const curInfo = metadata[id];
    if (!curInfo) {
      return true;
    }
    return curInfo['shouldDownload'];
  };

const createETagFilter =
  (eTags, metadata) =>
  ([id]) => {
    return !eTags.includes(metadata[id]?.eTag);
  };

const saveImgs = async (url, options = {}) => {
  try {
    const { key, id } = resolveParamsFromUrl(decodeURIComponent(url));
    if (!key || !id) {
      return;
    }
    updateMergedOptions(options);
    updateMetadataPath();
    const metadata = getMetadata(metadataPath);

    const imgUrlsInfo = await getImgUrlsInfo(key, id).then(
      async (imgUrlsInfo) =>
        filterObject(
          filterObject(imgUrlsInfo, createMetadataFilter(metadata)),
          createETagFilter(await getETag(imgUrlsInfo), metadata),
        ),
    );

    const imgUrlEntries = Object.entries(imgUrlsInfo).filter(
      // eslint-disable-next-line no-unused-vars
      ([_, { url }]) => url,
    );
    const sdImgNums = imgUrlEntries.length;
    if (!sdImgNums) {
      console.log('\n' + picocolors.green('Done🎉'));
      return;
    }

    const { progressBar } = useProgressBar(sdImgNums);
    console.log(picocolors.green('Downloading... 🐢'));
    progressBar.start(sdImgNums, 0);
    const promises = imgUrlEntries.map(([id, { url, name }]) => () => {
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
