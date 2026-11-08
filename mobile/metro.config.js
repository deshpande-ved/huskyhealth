// Metro: also watch ../web/js so the app imports the exact engine.js / features.js / view.js the website runs.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../web/js")];
module.exports = config;
