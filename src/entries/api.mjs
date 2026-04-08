import packageApi from '../index.js';

const NeuraiAssets = packageApi?.NeuraiAssets ?? packageApi;
const AssetQueries = packageApi?.AssetQueries;
const builders = packageApi?.builders ?? {};
const constants = packageApi?.constants ?? {};
const errors = packageApi?.errors ?? {};
const validators = packageApi?.validators ?? {};
const utils = packageApi?.utils ?? {};

const publicApi = Object.assign(NeuraiAssets, {
  NeuraiAssets,
  AssetQueries,
  builders,
  constants,
  errors,
  validators,
  utils
});

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
