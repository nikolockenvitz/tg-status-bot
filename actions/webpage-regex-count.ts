import { TelegramBot } from "../telegram-bot";
import { IWebpageRegexMatcherConfig } from "../types";
import { AbstractAction } from "./general/abstract-action";
import * as executionTimeHelper from "./general/execution-time-helper";
import { fetch } from "./general/utils";
const config = require("./general/config-import");

export default class WebpageRegexCount extends AbstractAction {
  private config: IWebpageRegexMatcherConfig;

  constructor() {
    super();
    this.config = config.WEBPAGE_REGEX_COUNT_CONFIG || { webpages: [] };
  }

  isEnabled(): boolean {
    return Array.isArray(this.config?.webpages) && this.config.webpages.length > 0;
  }

  getNextExecutionTime(lastExecutionTime: Date, lastSuccessfulExecutionTime: Date): Date {
    return lastExecutionTime.getTime() === lastSuccessfulExecutionTime.getTime()
      ? executionTimeHelper.interval(lastExecutionTime, 12 * 60 * 60)
      : executionTimeHelper.interval(lastExecutionTime, 10 * 60);
  }

  async run(data: any, bot: TelegramBot): Promise<boolean> {
    let error = false;
    for (const webpage of this.config.webpages || []) {
      try {
        const dataId = webpage.url + " " + webpage.regex.toString();
        const html = await fetch("GET", webpage.url);
        const regexCount = ((html || "").match(webpage.regex) || []).length;
        if (regexCount !== data[dataId]) {
          bot.send(`WebpageRegexCount: ${webpage.message}\n\nChanged from ${data[dataId]} to ${regexCount}\n\n${webpage.url}`);
        }
        data[dataId] = regexCount;
      } catch {
        error = true;
      }
    }
    if (error) {
      return false;
    }
    return true;
  }
}
