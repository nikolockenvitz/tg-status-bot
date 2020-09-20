import { TelegramBot } from "../telegram-bot";
import { AbstractAction } from "./general/abstract-action";
import * as executionTimeHelper from "./general/execution-time-helper";
import { fetch } from "./general/utils";

export default class SAPAddonCwsVersion extends AbstractAction {
  getNextExecutionTime(lastExecutionTime: Date): Date {
    return executionTimeHelper.weekly(lastExecutionTime, executionTimeHelper.DAY.MONDAY, 9, 30);
  }

  async run(data: any, bot: TelegramBot): Promise<void> {
    const html = await fetch("GET", "https://chrome.google.com/webstore/detail/sap-addon/ccjpkhcdklddbfpcboffbeihonalpjkc");
    const versionRegex = new RegExp(`<Attribute name="user_count">([^<]*)</Attribute>`);
    const regexResult = versionRegex.exec(html);
    if (regexResult === null) {
      return bot.send("Reading user_count for SAP Addon failed - regex didn't match");
    }
    const userCount = Number(regexResult[1]);
    if (isNaN(userCount)) return bot.send(`Reading user_count for SAP Addon failed - NaN - ${regexResult[1]}`);
    const diff = userCount - (data.userCount || 0);
    bot.send(`CWS SAP Addon: ${userCount} users (${["", "±", "+"][Math.sign(diff) + 1]}${diff})`);
    data.userCount = userCount;
  }
}
