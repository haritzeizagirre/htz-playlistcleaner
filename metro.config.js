// Metro config para consumir la librería local @haritzeiza/htz-react
// (C:\VSCode\haritz-components-react) instalada como dependencia `file:`.
//
// - watchFolders: Metro vigila también el código fuente de la librería.
// - nodeModulesPaths + disableHierarchicalLookup: las dependencias de la
//   librería (react, react-native...) se resuelven SIEMPRE desde la app,
//   evitando duplicar react-native (la librería tiene su propio
//   node_modules para desarrollo).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const libraryRoot = path.resolve(projectRoot, '..', 'haritz-components-react');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), libraryRoot];

config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
