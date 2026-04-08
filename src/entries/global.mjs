import publicApi, {
  AssetQueries,
  NeuraiAssets,
  builders,
  constants,
  errors,
  utils,
  validators
} from './api.mjs';

const globalScope =
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof self !== 'undefined'
      ? self
      : window;

globalScope.NeuraiAssets = publicApi;

export default publicApi;
export {
  AssetQueries,
  NeuraiAssets,
  builders,
  constants,
  errors,
  utils,
  validators
};
