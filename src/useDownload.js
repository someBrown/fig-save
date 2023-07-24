import https from 'https';
import fs from 'fs';
import { EVENTS } from './const.js';
import { mkdirsSync } from 'fs-extra/esm';

export const useDownload = ({
  id,
  url,
  saveDir,
  filename,
  previousEtag,
  onComplete,
}) =>
  new Promise((resolve, reject) => {
    const abortController = new AbortController();
    const signal = abortController.signal;

    const _resolve = (res) => {
      resolve(res);
      onComplete();
    };

    https.get(url, { signal }, (res) => {
      const eTag = res.headers['etag'];
      if (eTag === previousEtag) {
        abortController.abort();
        _resolve({
          id,
          eTag,
        });
        return;
      }
      mkdirsSync(saveDir);
      const fileStream = fs.createWriteStream(`${saveDir}/${filename}`);
      res.pipe(fileStream);
      res.on(EVENTS.END, () => {
        _resolve({
          id,
          eTag,
        });
      });
      res.on(EVENTS.ERROR, () => {
        reject();
      });
    });
  });
