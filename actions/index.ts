const fs = require("fs");

const filetypeToExport = ".ts";

const files = fs.readdirSync(__dirname);
for (const file of files) {
  if (!file.endsWith(filetypeToExport)) continue;
  if (file === __filename.substring(__dirname.length + 1)) {
    continue;
  }
  const filenameWoType = file.substring(0, file.length - filetypeToExport.length);
  exports[filenameWoType] = require(`./${filenameWoType}`);
}
