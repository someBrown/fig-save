import https from 'https';
// import fs from 'fs';
import { EVENTS } from './const.js';
// import { mkdirsSync } from 'fs-extra/esm';

export const useETag = ({ id, url, onComplete }) =>
  new Promise((resolve, reject) => {
    const _resolve = (res) => {
      resolve(res);
      onComplete();
    };

    const options = new URL(url);
    options.method = 'HEAD';

    const req = https.request(options, (res) => {
      const etag = res.headers.etag;
      _resolve({
        id,
        eTag: etag,
      });
    });

    req.on(EVENTS.ERROR, () => {
      reject();
    });
    req.end();
  });
