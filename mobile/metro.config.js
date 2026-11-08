// Metro: also watch ../web/js and ../web/art so the app imports the exact engine, views and mark the website uses.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../web/js"), path.resolve(__dirname, "../web/art")];
module.exports = config;
