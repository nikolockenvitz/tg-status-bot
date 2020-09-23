import { TelegramBot } from "../telegram-bot";
import { AbstractAction } from "./general/abstract-action";
import * as executionTimeHelper from "./general/execution-time-helper";

import { fetch, objectToFormData, formatDate } from "./general/utils";

interface IFreeSlotPerDay {
  date: number;
  month: number;
  year: number;
  freeSlots: number;
}

export default class PotsdamBuergerservice extends AbstractAction {
  getNextExecutionTime(lastExecutionTime: Date, lastSuccessfulExecutionTime: Date): Date {
    return lastExecutionTime.getTime() === lastSuccessfulExecutionTime.getTime()
      ? executionTimeHelper.interval(lastExecutionTime, 10 * 60)
      : executionTimeHelper.interval(lastExecutionTime, 2 * 60);
  }

  async run(data: any, bot: TelegramBot): Promise<boolean> {
    try {
      const slots = await this.getNumberOfFreeSlotsPerDay();
      const lookingForDates = {
        "2020": {
          "10": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        },
      };
      const matches: IFreeSlotPerDay[] = [];
      for (const slot of slots) {
        if (slot.freeSlots > 0) {
          if (
            slot.year in lookingForDates &&
            slot.month in lookingForDates[slot.year] &&
            lookingForDates[slot.year][slot.month].includes(slot.date)
          ) {
            matches.push(slot);
          }
        }
      }

      if (matches.length > 0) {
        let message = "Potsdam Buergerservice - Free Slots:";
        for (const match of matches) {
          message += `\n${formatDate(new Date(match.year, match.month - 1, match.date), "DD.MM.YYYY")}: ${match.freeSlots}`;
        }
        bot.send(message);
      }
      data.successful = true;
      return true;
    } catch (error) {
      if (
        error &&
        error.message &&
        (error.message.endsWith("failed, reason: read ECONNRESET") || error.message.includes("failed, reason: getaddrinfo ENOTFOUND"))
      ) {
        if (data.successful === false) {
          // didn't fail last time -> probably only temporary error
          data.successful = false;
          console.log(error.message);
          return false;
        }
      }
      data.successful = false;
      console.log(error);
      bot.send(`Potsdam Buergerservice: Failed to get number of free slots per day (${error.message})`);
      return false;
    }
  }

  async getNumberOfFreeSlotsPerDay(): Promise<IFreeSlotPerDay[]> {
    const baseUrl = `https://egov.potsdam.de/tnv/`;
    const labelText = `Anmeldung einer Haupt- oder Nebenwohnung (Anzahl der Familienmitglieder anklicken)`;

    const FORM_HEADERS = { "Content-Type": "application/x-www-form-urlencoded", Pragma: "no-cache", "Cache-Control": "no-cache" };

    const htmlMainPage = await fetch("GET", `${baseUrl}?START_OFFICE=buergerservice`);

    const regexSessionId = new RegExp(`action="bgr;jsessionid=([^"]*)"`);
    const regexPGUTSMSC = new RegExp(`<input type="hidden" name="PGUTSMSC" value="([^"]*)"/>`);
    const regexTCSID = new RegExp(`<input type="hidden" name="TCSID" value="([^"]*)"/>`);

    const sessionId = regexSessionId.exec(htmlMainPage)[1];
    let PGUTSMSC = regexPGUTSMSC.exec(htmlMainPage)[1];
    let TCSID = regexTCSID.exec(htmlMainPage)[1];

    const htmlAppointmentConcern = await fetch(
      "POST",
      `${baseUrl}bgr;jsessionid=${sessionId}`,
      objectToFormData({
        PGUTSMSC,
        TCSID,
        ACTION_OFFICESELECT_TERMNEW_PREFIX1333626470: "",
        OFFICESELECT_TERMID: "",
        OFFICESELECT_RESERVATIONPIN: "",
      }),
      {
        headers: FORM_HEADERS,
      }
    );

    const regexConcernId = new RegExp(`<label for="id\\_([^"]*)">${escapeRegExp(labelText)}</label>`);
    const concernId = regexConcernId.exec(htmlAppointmentConcern)[1];

    PGUTSMSC = regexPGUTSMSC.exec(htmlAppointmentConcern)[1];
    TCSID = regexTCSID.exec(htmlAppointmentConcern)[1];

    const htmlConcernFurtherInformation = await fetch(
      "POST",
      `${baseUrl}bgr;jsessionid=${sessionId}`,
      objectToFormData({
        PGUTSMSC,
        TCSID,
        ACTION_CONCERNSELECT_NEXT: "",
        [concernId]: "1",
      }),
      {
        headers: FORM_HEADERS,
      }
    );

    PGUTSMSC = regexPGUTSMSC.exec(htmlConcernFurtherInformation)[1];
    TCSID = regexTCSID.exec(htmlConcernFurtherInformation)[1];

    const htmlAppointmentCalendar = await fetch(
      "POST",
      `${baseUrl}bgr;jsessionid=${sessionId}`,
      objectToFormData({
        PGUTSMSC,
        TCSID,
        ACTION_CONCERNCOMMENTS_NEXT: "",
      }),
      {
        headers: FORM_HEADERS,
      }
    );

    const regexAppointmentCalendarCaption = new RegExp(`<caption>(\\w+) (\\d+)</caption>`, "g");
    let matchAppointmentCalendarCaption;
    const captions: { index: number; month: string; year: number }[] = [];
    while ((matchAppointmentCalendarCaption = regexAppointmentCalendarCaption.exec(htmlAppointmentCalendar))) {
      captions.push({
        index: matchAppointmentCalendarCaption.index,
        month: matchAppointmentCalendarCaption[1],
        year: Number(matchAppointmentCalendarCaption[2]),
      });
    }

    const regexAppointmentCalendarCell = new RegExp(
      `<div class="ekolCalendarDayNumberInRange">(\\d+)<span>\\.(\\d+)\\.</span></div><div class="ekolCalendarFreeTimeContainer">(\\d+) frei</div>`,
      "g"
    );
    let matchAppointmentCalendarCell;
    interface ITempFreeSlotPerDay extends Partial<IFreeSlotPerDay> {
      index: number;
    }
    const tempFreeSlotsPerDay: ITempFreeSlotPerDay[] = [];
    while ((matchAppointmentCalendarCell = regexAppointmentCalendarCell.exec(htmlAppointmentCalendar))) {
      tempFreeSlotsPerDay.push({
        index: matchAppointmentCalendarCell.index,
        date: Number(matchAppointmentCalendarCell[1]),
        month: Number(matchAppointmentCalendarCell[2]),
        freeSlots: Number(matchAppointmentCalendarCell[3]),
      });
    }

    const freeSlotsPerDay: IFreeSlotPerDay[] = [];
    let captionIndex = 0;
    for (const day of tempFreeSlotsPerDay) {
      while (captionIndex + 1 < captions.length && day.index > captions[captionIndex + 1].index) {
        captionIndex++;
      }
      freeSlotsPerDay.push({
        date: day.date,
        month: day.month,
        year: captions[captionIndex].year,
        freeSlots: day.freeSlots,
      });
    }
    return freeSlotsPerDay;
  }
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
