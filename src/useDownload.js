import https from 'https';
import fs from 'fs';
import { EVENTS } from './const.js';
import { mkdirsSync } from 'fs-extra/esm';

export const useDownload = ({ id, url, saveDir, filename, onComplete }) =>
  new Promise((resolve, reject) => {
    const _resolve = (res) => {
      resolve(res);
      onComplete(res);
    };
    const req = https.get(url, (res) => {
      const eTag = res.headers.etag;
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
    req.on(EVENTS.ERROR, () => {
      reject();
    });
  });
