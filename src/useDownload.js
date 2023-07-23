import https from 'https';
import fs from 'fs';
import { EVENTS } from './const.js';
import { mkdirsSync } from 'fs-extra/esm';

export const useDownload = ({ id, url, saveDir, filename, onComplete }) =>
  new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // const totalSize = parseInt(res.headers['content-length'], 10);

      mkdirsSync(saveDir);
      const fileStream = fs.createWriteStream(`${saveDir}/${filename}`);
      res.pipe(fileStream);

      // res.on(EVENTS.DATA, (chunk) => {
      //   onProgress(totalSize, chunk.length);
      // });
      res.on(EVENTS.END, () => {
        onComplete();
        resolve(id);
      });
      res.on(EVENTS.ERROR, () => {
        reject();
      });
    });
  });
