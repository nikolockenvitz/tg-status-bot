import { fetch } from "./general/utils";

import { TelegramBot } from "../telegram-bot";
import { AbstractAction } from "./general/abstract-action";
import * as executionTimeHelper from "./general/execution-time-helper";
import { IWeeklyExecutionTime } from "../types";
const config = require("./general/config-import");

export default class PotsdamBuergerservice extends AbstractAction {
  private baseUrl = "https://www.kaufland.de";
  private weeklyExecutionTime: IWeeklyExecutionTime;
  private searchTerms: string[] = [];
  private ignoreUrlPaths: string[] = [];

  constructor() {
    super();
    this.weeklyExecutionTime = config.DISCOUNT_SCANNER_KAUFLAND?.weeklyExecutionTime || { day: "TUESDAY", hour: 9, minute: 30 };
    this.searchTerms = config.DISCOUNT_SCANNER_KAUFLAND?.searchTerms;
    this.ignoreUrlPaths = config.DISCOUNT_SCANNER_KAUFLAND?.ignoreUrlPaths;
  }
  getNextExecutionTime(lastExecutionTime: Date, lastSuccessfulExecutionTime: Date): Date {
    return lastExecutionTime.getTime() === lastSuccessfulExecutionTime.getTime()
      ? executionTimeHelper.weekly(
          lastExecutionTime,
          executionTimeHelper.DAY[this.weeklyExecutionTime.day],
          this.weeklyExecutionTime.hour,
          this.weeklyExecutionTime.minute
        )
      : executionTimeHelper.interval(lastExecutionTime, 5 * 60);
  }

  isEnabled(): boolean {
    return this.searchTerms && this.searchTerms.length > 0;
  }

  async run(data: any, bot: TelegramBot): Promise<boolean> {
    try {
      const urls = await getDiscountUrls(this.baseUrl, this.ignoreUrlPaths);
      const discounts: IDiscount[] = [].concat(...(await Promise.all(urls.map((url) => getDiscounts(url)))));
      const matchingDiscounts: IDiscount[] = [];
      for (const discount of discounts) {
        for (const searchTerm of this.searchTerms) {
          if (doesSearchTermMatchDiscount(searchTerm, discount)) {
            matchingDiscounts.push(discount);
            break;
          }
        }
      }
      const sortedMatchingDiscounts = matchingDiscounts.sort((d1, d2) => {
        return d1.valid.toUnixTimestamp - d2.valid.toUnixTimestamp || d1.valid.fromUnixTimestamp - d2.valid.fromUnixTimestamp;
      });

      let message = "*🛒 Kaufland \\- Discounts*\n\n";
      const prevSectionValidity = { from: undefined, to: undefined };
      for (const discount of sortedMatchingDiscounts) {
        if (discount.valid.from !== prevSectionValidity.from || discount.valid.to !== prevSectionValidity.to) {
          prevSectionValidity.from = discount.valid.from;
          prevSectionValidity.to = discount.valid.to;
          message += validityFromToToMarkdown(discount.valid.from, discount.valid.to);
        }
        message += discountToMarkdown(discount);
      }
      bot.send(message, { markdownV2: true });
      data.successful = true;
      return true;
    } catch (error) {
      console.log(error);
      if (!data.successful) {
        // send notification about error only when it repeats
        bot.send(`Discount Scanner Kaufland - Error: ${error.message}`);
      }
      data.successful = false;
      return false;
    }
  }
}

interface IValidFromTo {
  from: string;
  to: string;
  fromUnixTimestamp: number;
  toUnixTimestamp: number;
}

interface IDiscount {
  subtitle: string;
  title: string | undefined;
  quantity: string;
  basicPrice: string | undefined;
  discount: string | undefined;
  oldPrice: string;
  price: string;
  valid: IValidFromTo;
}

async function getDiscountUrls(baseUrl: string, ignoreUrlPaths: string[]): Promise<string[]> {
  const html = await fetch("GET", baseUrl);

  const regexNavUrls = new RegExp(
    `<a class="o-navigation-main__link o-navigation-main__link--level-(?<level>\\d+)" role="menuitem" href="(?<url>[^"]*)"`,
    "g"
  );
  const navUrls: Array<{ level: number; url: string }> = [];
  let matchUrl;
  while ((matchUrl = regexNavUrls.exec(html))) {
    navUrls.push({
      level: Number(matchUrl.groups.level),
      url: matchUrl.groups.url,
    });
  }

  // links are in tree-structure, only leaf nodes for discounts ("/angebote/...") are interesting
  const discountUrls: string[] = [];
  for (let i = 0; i < navUrls.length; i++) {
    if (
      (i === navUrls.length - 1 || navUrls[i] <= navUrls[i + 1]) &&
      navUrls[i].url.startsWith("/angebote/") &&
      !ignoreUrlPaths.includes(navUrls[i].url)
    ) {
      discountUrls.push(baseUrl + navUrls[i].url);
    }
  }
  return discountUrls;
}

async function getDiscounts(url: string): Promise<Array<IDiscount>> {
  const html = await fetch("GET", url);

  const regexValidFromTo = new RegExp(`<h2>Gültig vom (\\d{2}\\.\\d{2}\\.\\d{4}) bis (\\d{2}\\.\\d{2}\\.\\d{4})</h2>`);
  const matchValidFromTo = regexValidFromTo.exec(html);
  const valid: IValidFromTo = {
    from: matchValidFromTo[1],
    to: matchValidFromTo[2],
    fromUnixTimestamp: dateStringToUnixTimestamp(matchValidFromTo[1]),
    toUnixTimestamp: dateStringToUnixTimestamp(matchValidFromTo[2]),
  };

  const regexDiscount = new RegExp(
    `<h5 class="m-offer-tile__subtitle">(?<subtitle>[^<]*)</h5>` +
      `(\\s*<h4 class="m-offer-tile__title">\\s*(?<title>.*[^\\s])\\s*</h4>|)` +
      `\\s*<div class="m-offer-tile__quantity">\\s*(?<quantity>.*[^\\s])\\s*</div>` +
      `(\\s*<div class="m-offer-tile__basic-price">(?<basicPrice>[^<]*) </div>|)` +
      `\\s*</div>\\s*</div>\\s*<div class="m-offer-tile__split">\\s*<div class="m-offer-tile__price-tiles">` +
      `\\s*<div class="a-pricetag[^\\"]* ">` +
      `(\\s*<div class="a-pricetag__discount">\\s*(?<discount>.*[^\\s])\\s*</div>|)` +
      `\\s*<div class="a-pricetag__price-container ">` +
      `\\s*<div class="a-pricetag__old-price">\\s*(?<oldPrice>.*[^\\s])\\s*</div>` +
      `\\s*<div class="a-pricetag__price">\\s*(?<price>[^<]*[^\\s])(<.*>)?\\s*</div>`,
    "g"
  );
  const discounts: Array<IDiscount> = [];
  let matchDiscount;
  while ((matchDiscount = regexDiscount.exec(html))) {
    discounts.push({
      ...matchDiscount.groups,
      valid,
    });
  }

  const subtitleEntries = html.match(new RegExp(`<h5 class="m-offer-tile__subtitle">(?<subtitle>[^<]*)</h5>`, "g"));
  if (discounts.length !== subtitleEntries.length) {
    // complete regex doesn't match for certain entries; find and log them to fix it
    for (const subtitleEntry of subtitleEntries) {
      const subtitle = subtitleEntry.split(">")[1].split("<")[0];
      if (!discounts.find((d) => d.subtitle === subtitle)) {
        console.log("Discount Scanner Kaufland failed for", subtitle, `(${url})`);
      }
    }
  }

  return discounts;
}

function dateStringToUnixTimestamp(dateString: string): number {
  const [day, month, year] = dateString.split(".");
  return Math.floor(new Date(Number(year), Number(month) - 1, Number(day)).getTime() / 1000);
}

function doesSearchTermMatchDiscount(searchTerm: string, discount: IDiscount): boolean {
  return (
    (discount.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    discount.subtitle.toLowerCase().includes(searchTerm.toLowerCase())
  );
}

function validityFromToToMarkdown(from: string, to: string) {
  return `🗓️ ${escapeMarkdown(from)} \\- ${escapeMarkdown(to)}\n`;
}

function discountToMarkdown(discount: IDiscount): string {
  return (
    `*${escapeMarkdown(discount.subtitle)} ${escapeMarkdown(discount.title || "")}*\n` +
    `~${escapeMarkdown(discount.oldPrice)}~ ${escapeMarkdown(discount.price)} \\(${escapeMarkdown(discount.discount)}\\)\n` +
    `${escapeMarkdown(discount.quantity)} ${escapeMarkdown(discount.basicPrice)}\n\n`
  );
}

function escapeMarkdown(string: string): string {
  return string.replace(/[_\*\[\]\(\)~`>#\+\-=\|\{\}\.!]/g, "\\$&");
}
