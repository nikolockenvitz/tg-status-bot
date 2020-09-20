require("dotenv").config();

const fs = require("fs");
import { TelegramBot } from "./telegram-bot";
import { AbstractAction } from "./actions/general/abstract-action";
const Actions = require("./actions");

const FILENAME_DATA = "data.json";
interface IData {
  _updateTimes?: any;
  [key: string]: any;
}

const actions: AbstractAction[] = [];

async function main() {
  const data = await readDataFromFile();

  // init actions
  for (const actionName of Object.keys(Actions)) {
    const action = new Actions[actionName].default();
    if (action instanceof AbstractAction) {
      if (actionName.startsWith("_")) throw new Error("Name of the action (file) must not start with an underscore");
      action.name = actionName;
      if (!(actionName in data)) {
        data[actionName] = {};
      }
      actions.push(action);
    }
  }
  saveDataToFile(data);

  console.log(`Found ${actions.length} actions, starting bot.`);
  const bot = new TelegramBot(data._updateTimes);

  for (const action of actions) {
    executeAction(action, data, bot);
  }
}

function executeAction(action: AbstractAction, data: IData, bot) {
  const now = Date.now();
  const timeToWait = action.getNextExecutionTime(data._updateTimes[action.name] || new Date(0)).getTime() - now;
  setTimeout(async function () {
    await action.run(data[action.name], bot);
    data._updateTimes[action.name] = new Date();
    saveDataToFile(data);
    executeAction(action, data, bot);
  }, timeToWait);
}

main();

function readDataFromFile(): IData {
  return new Promise((resolve) => {
    fs.readFile(FILENAME_DATA, "utf8", (err, data) => {
      if (err) throw err;
      try {
        data = JSON.parse(data);
      } catch {
        data = {};
      }
      if (!("_updateTimes" in data)) {
        data._updateTimes = {};
      } else {
        for (const key in data._updateTimes) {
          if (data._updateTimes[key] && !(data._updateTimes[key] instanceof Date)) {
            data._updateTimes[key] = new Date(data._updateTimes[key]);
          }
        }
      }
      resolve(data);
    });
  });
}

async function saveDataToFile(data: IData) {
  return new Promise((resolve) => {
    fs.writeFile(FILENAME_DATA, JSON.stringify(data, null, 2), "utf8", (err) => {
      if (err) throw err;
      resolve();
    });
  });
}
