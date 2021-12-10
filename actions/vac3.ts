import { TelegramBot } from "../telegram-bot";
import { AbstractAction } from "./general/abstract-action";
import * as executionTimeHelper from "./general/execution-time-helper";
const config = require("./general/config-import");

import { fetch } from "./general/utils";

export default class VaccinationAppointmentScanner extends AbstractAction {
  constructor() {
    super();
  }
  getNextExecutionTime(
    lastExecutionTime: Date,
    lastSuccessfulExecutionTime: Date
  ): Date {
    function weekly(
      weekday: number,
      hour: number,
      minute: number
    ): number {
      return executionTimeHelper
        .weekly(lastExecutionTime, weekday, hour, minute)
        .getTime();
    }
    return lastExecutionTime.getTime() === lastSuccessfulExecutionTime.getTime()
      ? new Date(
          Math.min(
            weekly(executionTimeHelper.DAY.WEDNESDAY, 16, 55),
            weekly(executionTimeHelper.DAY.WEDNESDAY, 17, 0),
            weekly(executionTimeHelper.DAY.WEDNESDAY, 17, 5),
            weekly(executionTimeHelper.DAY.WEDNESDAY, 17, 10),
            weekly(executionTimeHelper.DAY.WEDNESDAY, 17, 15),
            weekly(executionTimeHelper.DAY.WEDNESDAY, 17, 30),
            weekly(executionTimeHelper.DAY.WEDNESDAY, 17, 45),
            weekly(executionTimeHelper.DAY.SATURDAY, 9, 55),
            weekly(executionTimeHelper.DAY.SATURDAY, 10, 0),
            weekly(executionTimeHelper.DAY.SATURDAY, 10, 5),
            weekly(executionTimeHelper.DAY.SATURDAY, 10, 10),
            weekly(executionTimeHelper.DAY.SATURDAY, 10, 15),
            weekly(executionTimeHelper.DAY.SATURDAY, 10, 30),
            weekly(executionTimeHelper.DAY.SATURDAY, 10, 45),
            executionTimeHelper.interval(lastExecutionTime, 60 * 60).getTime()
          )
        )
      : executionTimeHelper.interval(lastExecutionTime, 5 * 60);
  }

  isEnabled(): boolean {
    return config.VAC3.urls.length > 0;
  }

  async run(data: any, bot: TelegramBot): Promise<boolean> {
    let successful = true;
    for (const url of config.VAC3.urls) {
      const { name, urlApi, urlWeb } = url;
      try {
        const htmlPage = await fetch("GET", urlApi);
        const data = JSON.parse(htmlPage);
        if (data.dates && data.dates.length > 0) {
          bot.send(
            `Vac3: Available Appointments! ${name}\n${data.dates}\n\n[Book](${urlWeb})`,
            { markdown: true }
          );
        }
        continue;
      } catch (error) {
        if (
          error &&
          error.message &&
          (error.message.endsWith("failed, reason: read ECONNRESET") ||
            error.message.includes("failed, reason: getaddrinfo ENOTFOUND"))
        ) {
          if (data.successful === true) {
            // didn't fail last time -> probably only temporary error
            successful = false;
            console.log(error.message);
            continue;
          }
        }
        successful = false;
        console.log(error);
        bot.send(`Vac3 failed: (${error.message})`);
        continue;
      }
    }
    data.successful = successful;
    return successful;
  }
}
