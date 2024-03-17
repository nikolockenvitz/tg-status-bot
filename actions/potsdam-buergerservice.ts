import { TelegramBot } from "../telegram-bot";
import { AbstractAction } from "./general/abstract-action";
import * as executionTimeHelper from "./general/execution-time-helper";
const config = require("./general/config-import");

import { objectToFormData, formatDate } from "./general/utils";
import { IDateSelection } from "../types";

interface IFreeSlotPerDay {
  date: number;
  month: number;
  year: number;
  freeSlots: number;
}

import axios from "axios";
import * as crypto from "crypto";
import * as https from "https";

const axiosClient = axios.create({
  httpsAgent: new https.Agent({
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
  }),
});

export default class PotsdamBuergerservice extends AbstractAction {
  private labelToLookFor = "";
  private lookingForDates: IDateSelection = {};

  constructor() {
    super();
    this.labelToLookFor = config.POTSDAM_BUERGERSERVICE?.LABEL;
    this.lookingForDates = config.POTSDAM_BUERGERSERVICE?.LOOKING_FOR_DATES;
  }
  getNextExecutionTime(
    lastExecutionTime: Date,
    lastSuccessfulExecutionTime: Date
  ): Date {
    return lastExecutionTime.getTime() === lastSuccessfulExecutionTime.getTime()
      ? executionTimeHelper.interval(lastExecutionTime, 10 * 60)
      : executionTimeHelper.interval(lastExecutionTime, 2 * 60);
  }

  isEnabled(): boolean {
    return this.lookingForDates && Object.keys(this.lookingForDates).length > 0;
  }

  async run(data: any, bot: TelegramBot): Promise<boolean> {
    const oldMessage = data.message || "";
    try {
      const { slots, url } = await this.getNumberOfFreeSlotsPerDay();
      const matches: IFreeSlotPerDay[] = [];
      for (const slot of slots) {
        if (slot.freeSlots > 0) {
          if (
            slot.year in this.lookingForDates &&
            slot.month in this.lookingForDates[slot.year] &&
            this.lookingForDates[slot.year][slot.month].includes(slot.date)
          ) {
            matches.push(slot);
          }
        }
      }

      if (matches.length > 0) {
        let message = "Potsdam Buergerservice - Free Slots:";
        for (const match of matches) {
          message += `\n${formatDate(
            new Date(match.year, match.month - 1, match.date),
            "DD.MM.YYYY"
          )}: ${match.freeSlots}`;
        }
        message += `\n\n[Book Appointment](${url})`;
        if (
          message.split("\n\n[Book Appointment]")[0] !==
          oldMessage.split("\n\n[Book Appointment]")[0]
        ) {
          bot.send(message, { markdown: true });
        }
        data.message = message;
      } else {
        if (oldMessage) {
          bot.send("Potsdam Buergerservice - No Free Slots");
        }
        data.message = "";
      }
      data.successful = true;
      return true;
    } catch (error) {
      if (
        error &&
        error.message &&
        (error.message.endsWith("failed, reason: read ECONNRESET") ||
          error.message.includes("failed, reason: getaddrinfo ENOTFOUND"))
      ) {
        if (data.successful === true) {
          // didn't fail last time -> probably only temporary error
          data.successful = false;
          console.log(error.message);
          return false;
        }
      }
      data.successful = false;
      console.log(error);
      bot.send(
        `Potsdam Buergerservice: Failed to get number of free slots per day (${error.message})`
      );
      return false;
    }
  }

  async getNumberOfFreeSlotsPerDay(): Promise<{
    slots: IFreeSlotPerDay[];
    url: string;
  }> {
    const baseUrl = `https://egov.potsdam.de/tnv/`;
    const labelText =
      this.labelToLookFor ||
      `Anmeldung einer Haupt- oder Nebenwohnung (Anzahl der Familienmitglieder anklicken)`;

    const FORM_HEADERS = {
      "Content-Type": "application/x-www-form-urlencoded",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
    };

    const htmlMainPage = (
      await axiosClient.get(`${baseUrl}?START_OFFICE=buergerservice`)
    ).data;

    const regexSessionId = new RegExp(`action="bgr;jsessionid=([^"]*)"`);
    const regexPGUTSMSC = new RegExp(
      `<input type="hidden" name="PGUTSMSC" value="([^"]*)"/>`
    );
    const regexTCSID = new RegExp(
      `<input type="hidden" name="TCSID" value="([^"]*)"/>`
    );

    const sessionId = regexSessionId.exec(htmlMainPage)[1];
    let PGUTSMSC = regexPGUTSMSC.exec(htmlMainPage)[1];
    let TCSID = regexTCSID.exec(htmlMainPage)[1];

    function objectToFormData2(data: object) {
      // console.log(data);
      const params = new URLSearchParams();
      for (const k in data) {
        params.append(k, data[k]);
      }
      return params;
    }
    const htmlAppointmentConcern = (await axiosClient.post(
      `${baseUrl}bgr;jsessionid=${sessionId}`,
      objectToFormData2({
        PGUTSMSC,
        TCSID,
        ACTION_OFFICESELECT_TERMNEW_PREFIX1333626470: "",
        OFFICESELECT_TERMID: "",
        OFFICESELECT_RESERVATIONPIN: "",
      }),
      {
        headers: FORM_HEADERS,
      }
    )).data;

    const regexConcernId = new RegExp(
      `<label for="id\\_([^"]*)">${escapeRegExp(
        replaceHtmlSpecialChars(labelText)
      )}</label>`
    );
    const concernId = regexConcernId.exec(htmlAppointmentConcern)[1];

    PGUTSMSC = regexPGUTSMSC.exec(htmlAppointmentConcern)[1];
    TCSID = regexTCSID.exec(htmlAppointmentConcern)[1];

    const htmlConcernFurtherInformation = (await axiosClient.post(
      `${baseUrl}bgr;jsessionid=${sessionId}`,
      objectToFormData2({
        PGUTSMSC,
        TCSID,
        ACTION_CONCERNSELECT_NEXT: "",
        [concernId]: "1",
      }),
      {
        headers: FORM_HEADERS,
      }
    )).data;

    PGUTSMSC = regexPGUTSMSC.exec(htmlConcernFurtherInformation)[1];
    TCSID = regexTCSID.exec(htmlConcernFurtherInformation)[1];

    const htmlAppointmentCalendar = (await axiosClient.post(
      `${baseUrl}bgr;jsessionid=${sessionId}`,
      objectToFormData2({
        PGUTSMSC,
        TCSID,
        ACTION_CONCERNCOMMENTS_NEXT: "",
      }),
      {
        headers: FORM_HEADERS,
      }
    )).data;

    const regexAppointmentCalendarCaption = new RegExp(
      `<caption>(\\w+) (\\d+)</caption>`,
      "g"
    );
    let matchAppointmentCalendarCaption;
    const captions: { index: number; month: string; year: number }[] = [];
    while (
      (matchAppointmentCalendarCaption = regexAppointmentCalendarCaption.exec(
        htmlAppointmentCalendar
      ))
    ) {
      captions.push({
        index: matchAppointmentCalendarCaption.index,
        month: matchAppointmentCalendarCaption[1],
        year: Number(matchAppointmentCalendarCaption[2]),
      });
    }

    const regexAppointmentCalendarCell = new RegExp(
      `<div class="ekolCalendar_DayNumberInRange">(\\d+)<span class="conMonthNr">\\.(\\d+)\\.</span></div><div class="ekolCalendar_FreeTimeContainer">(\\d+) frei</div>`,
      "g"
    );
    let matchAppointmentCalendarCell;
    interface ITempFreeSlotPerDay extends Partial<IFreeSlotPerDay> {
      index: number;
    }
    const tempFreeSlotsPerDay: ITempFreeSlotPerDay[] = [];
    while (
      (matchAppointmentCalendarCell = regexAppointmentCalendarCell.exec(
        htmlAppointmentCalendar
      ))
    ) {
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
      while (
        captionIndex + 1 < captions.length &&
        day.index > captions[captionIndex + 1].index
      ) {
        captionIndex++;
      }
      freeSlotsPerDay.push({
        date: day.date,
        month: day.month,
        year: captions[captionIndex].year,
        freeSlots: day.freeSlots,
      });
    }
    return {
      slots: freeSlotsPerDay,
      url: `${baseUrl}bgr;jsessionid=${sessionId}?${objectToFormData({
        PGUTSMSC,
        TCSID,
        ACTION_CONCERNCOMMENTS_NEXT: "",
      })}`,
    };
  }
}

function replaceHtmlSpecialChars(string: string): string {
  return string
    .replace(/ä/g, "&#xe4;")
    .replace(/ö/g, "&#xf6;")
    .replace(/ü/g, "&#xfc;");
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
