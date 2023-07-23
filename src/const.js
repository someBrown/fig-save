import path from 'path';

export const EVENTS = {
  DATA: 'data',
  END: 'end',
  ERROR: 'error',
};

export const FIGMA_API_TYPE = {
  GET_FILE_NODES: 'getFileNodes',
  GET_IMAGE: 'getImage',
};

const __dirname = path.dirname(new URL(import.meta.url).pathname);
export const CURRENT_ROOT = path.resolve(__dirname, '..');

export const DEFAULT_DOWNLOAD_OPTIONS = {
  format: 'png',
  scale: 1,
  figmaImgTypes: ['FRAME', 'COMPONENT'],
  concurrency: 5,
  saveDir: path.resolve(process.cwd(), './imgs'),
};

export const TOKEN_FILE_NAME = 'token.json';

export const METADATA_FILE_NAME = 'metadata.json';
