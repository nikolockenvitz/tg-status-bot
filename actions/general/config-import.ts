const fs_2 = require("fs");

const configFilePath = process.env.CONFIG_PATH;
if (configFilePath && doesfileExist(`${configFilePath}.ts`)) {
  module.exports = require(`../../${configFilePath}`).config;
}

function doesfileExist(filePath: string): boolean {
  try {
    fs_2.readFileSync(filePath, "utf8");
    return true;
  } catch {
    return false;
  }
}
