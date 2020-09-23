require("dotenv").config();

const fs = require("fs");
import { TelegramBot } from "./telegram-bot";
import { AbstractAction } from "./actions/general/abstract-action";
const Actions = require("./actions");

const FILENAME_DATA = "data.json";
interface IData {
  _updateTimes?: any;
  _lastSuccessfulUpdateTimes?: any;
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
  const bot = new TelegramBot(
    actions.reduce((actionsEnabledStatus, action) => {
      actionsEnabledStatus[action.name] = action.isEnabled();
      return actionsEnabledStatus;
    }, {}),
    data._updateTimes,
    data._lastSuccessfulUpdateTimes
  );

  for (const action of actions) {
    executeAction(action, data, bot);
  }
}

const MAX_TIME_TIMEOUT = Math.pow(2, 31) - 1;

function executeAction(action: AbstractAction, data: IData, bot: TelegramBot) {
  const now = Date.now();
  const timeToWait =
    action
      .getNextExecutionTime(data._updateTimes[action.name] || new Date(0), data._lastSuccessfulUpdateTimes[action.name] || new Date(0))
      .getTime() - now;
  if (timeToWait > MAX_TIME_TIMEOUT) {
    setTimeout(function () {
      executeAction(action, data, bot);
    }, MAX_TIME_TIMEOUT);
    return;
  }
  setTimeout(async function () {
    let successful = false;
    try {
      successful = await action.run(data[action.name], bot);
    } catch {}
    const now = new Date();
    data._updateTimes[action.name] = now;
    if (successful) {
      data._lastSuccessfulUpdateTimes[action.name] = now;
    }
    saveDataToFile(data);
    executeAction(action, data, bot);
  }, timeToWait);
}

main();

async function readDataFromFile(): Promise<IData> {
  return new Promise((resolve) => {
    fs.readFile(FILENAME_DATA, "utf8", (err: Error, data: any) => {
      if (err && !err.message.startsWith("ENOENT: no such file or directory")) throw err;
      try {
        data = JSON.parse(data);
      } catch {
        data = {};
      }
      for (const propertyActionDateMapping of ["_updateTimes", "_lastSuccessfulUpdateTimes"]) {
        if (!(propertyActionDateMapping in data)) {
          data[propertyActionDateMapping] = {};
        } else {
          for (const key in data[propertyActionDateMapping]) {
            if (data[propertyActionDateMapping][key] && !(data[propertyActionDateMapping][key] instanceof Date)) {
              data[propertyActionDateMapping][key] = new Date(data[propertyActionDateMapping][key]);
            }
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
