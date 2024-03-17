import { TelegramBot } from "../telegram-bot";
import { IWebpageRegexMatcherConfig } from "../types";
import { AbstractAction } from "./general/abstract-action";
import * as executionTimeHelper from "./general/execution-time-helper";
import { fetch } from "./general/utils";
const config = require("./general/config-import");

export default class WebpageRegexMatcher extends AbstractAction {
  private config: IWebpageRegexMatcherConfig;

  constructor() {
    super();
    this.config = config.WEBPAGE_INCLUDES_STRING_CONFIG || { webpages: [] };
  }

  isEnabled(): boolean {
    return Array.isArray(this.config?.webpages) && this.config.webpages.length > 0;
  }

  getNextExecutionTime(lastExecutionTime: Date, lastSuccessfulExecutionTime: Date): Date {
    return lastExecutionTime.getTime() === lastSuccessfulExecutionTime.getTime()
      ? executionTimeHelper.interval(lastExecutionTime, 5 * 60)
      : executionTimeHelper.interval(lastExecutionTime, 2 * 60);
  }

  async run(data: any, bot: TelegramBot): Promise<boolean> {
    let error = false;
    for (const webpage of this.config.webpages || []) {
      try {
        const dataId = webpage.url + " " + webpage.regex.toString();
        const html = await fetch("GET", webpage.url);
        const regexResult = html.match(webpage.regex) !== null;
        if (regexResult && (webpage.resend === true || !data[dataId])) {
          bot.send(`WebpageRegexMatch: ${webpage.message}\n\n${webpage.url}`);
        }
        data[dataId] = regexResult;
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
