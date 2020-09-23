import { TelegramBot } from "../telegram-bot";
import { AbstractAction } from "./general/abstract-action";
import * as executionTimeHelper from "./general/execution-time-helper";
import { fetch } from "./general/utils";

export default class SAPAddonCwsVersion extends AbstractAction {
  getNextExecutionTime(lastExecutionTime: Date, lastSuccessfulExecutionTime: Date): Date {
    return lastExecutionTime.getTime() === lastSuccessfulExecutionTime.getTime()
      ? executionTimeHelper.interval(lastExecutionTime, 20 * 60)
      : executionTimeHelper.interval(lastExecutionTime, 5 * 60);
  }

  async run(data: any, bot: TelegramBot): Promise<boolean> {
    const html = await fetch("GET", "https://chrome.google.com/webstore/detail/sap-addon/ccjpkhcdklddbfpcboffbeihonalpjkc");
    const versionRegex = new RegExp(`<meta itemprop="version" content="([^"]*)"/>`); // alt: `<div class="C-b-p-D-J"><span class="C-b-p-D-R">Version:</span>&nbsp;<span class="C-b-p-D-Xe h-C-b-p-D-md">([^<>]*)</span>`
    const regexResult = versionRegex.exec(html);
    if (regexResult === null) {
      bot.send("Reading version for SAP Addon failed - regex didn't match");
      return false;
    }
    const version = regexResult[1];
    if (version !== data.version) {
      bot.send(`CWS SAP Addon: ${data.version} -> ${version}`);
      data.version = version;
    }
    return true;
  }
}
