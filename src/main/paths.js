// src/main/paths.js
// Asar-safe path resolver. Resource files (icons, sounds) must be addressed
// through app.getAppPath() so they work both in dev (unpacked) and packaged
// (asar archive) builds.

'use strict';

const path = require('node:path');
const { app } = require('electron');

let appRoot = null;

function init() {
  if (appRoot) return appRoot;
  appRoot = app.getAppPath();
  return appRoot;
}

function rendererAsset(name) {
  return path.join(init(), 'src', 'renderer', 'assets', name);
}

function buildAsset(name) {
  return path.join(init(), 'build', name);
}

function userDataPath() {
  return app.getPath('userData');
}

module.exports = {
  init,
  rendererAsset,
  buildAsset,
  userDataPath,
};
