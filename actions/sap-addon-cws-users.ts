import { TelegramBot } from "../telegram-bot";
import { AbstractAction } from "./general/abstract-action";
import * as executionTimeHelper from "./general/execution-time-helper";
import { fetch } from "./general/utils";

export default class SAPAddonCwsVersion extends AbstractAction {
  getNextExecutionTime(lastExecutionTime: Date, lastSuccessfulExecutionTime: Date): Date {
    return lastExecutionTime.getTime() === lastSuccessfulExecutionTime.getTime()
      ? executionTimeHelper.weekly(lastExecutionTime, executionTimeHelper.DAY.MONDAY, 9, 30)
      : executionTimeHelper.interval(lastExecutionTime, 5 * 60);
  }

  async run(data: any, bot: TelegramBot): Promise<boolean> {
    const html = await fetch("GET", "https://chrome.google.com/webstore/detail/sap-addon/ccjpkhcdklddbfpcboffbeihonalpjkc");
    const userRegex = new RegExp(`<meta itemprop="interactionCount" content="UserDownloads:([^"]*)"/>`);
    const regexResult = userRegex.exec(html);
    if (regexResult === null) {
      bot.send("Reading user_count for SAP Addon failed - regex didn't match");
      return false;
    }
    const userCount = Number(regexResult[1]);
    if (isNaN(userCount)) {
      bot.send(`Reading user_count for SAP Addon failed - NaN - ${regexResult[1]}`);
      return false;
    }
    const diff = userCount - (data.userCount || 0);
    bot.send(`CWS SAP Addon: ${userCount} users (${["", "±", "+"][Math.sign(diff) + 1]}${diff})`);
    data.userCount = userCount;
    return true;
  }
}
