import { fetch } from "./general/utils";

import { TelegramBot } from "../telegram-bot";
import { AbstractAction } from "./general/abstract-action";
import * as executionTimeHelper from "./general/execution-time-helper";
import { IWeeklyExecutionTime } from "../types";
const config = require("./general/config-import");

export default class KauflandDiscountScanner extends AbstractAction {
  protected baseUrl = "https://filiale.kaufland.de";
  protected config: any;
  protected weeklyExecutionTime: IWeeklyExecutionTime;
  protected searchTerms: string[] = [];
  protected ignoreSearchTerms: string[] = [];
  protected ignoreUrlPaths: string[] = [];
  protected cookies: string = "";
  protected description: string = "";

  constructor() {
    super();
    this.config = config.DISCOUNT_SCANNER_KAUFLAND;
    this.readConfig();
  }

  readConfig() {
    this.weeklyExecutionTime = this.config?.weeklyExecutionTime || {
      day: "TUESDAY",
      hour: 9,
      minute: 30,
    };
    this.searchTerms = this.config?.searchTerms;
    this.ignoreSearchTerms = this.config?.ignoreSearchTerms;
    this.ignoreUrlPaths = this.config?.ignoreUrlPaths;
    this.cookies = this.config?.cookies;
    this.description =
      this.config?.description ||
      `Search: ${(this.searchTerms || ["?"]).join(", ")}`;
  }

  getNextExecutionTime(
    lastExecutionTime: Date,
    lastSuccessfulExecutionTime: Date
  ): Date {
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
      const t0 = Date.now();
      const urls = await getDiscountUrls(this.baseUrl, this.ignoreUrlPaths);
      let errors = 0;
      const discounts: IDiscount[] = ([] as IDiscount[]).concat(
        ...(
          await Promise.all(urls.map((url) => getDiscounts(url, this.cookies)))
        ).map((discountData) => {
          errors += discountData.errors;
          return discountData.discounts;
        })
      );
      if (discounts.length === 0) {
        throw new Error("Internal Error - Found no discounts at all.");
      }
      const matchingDiscounts: IDiscount[] = [];
      for (const discount of discounts) {
        let ignore = false;
        for (const ignoreSearchTerm of this.ignoreSearchTerms) {
          if (doesSearchTermMatchDiscount(ignoreSearchTerm, discount)) {
            ignore = true;
            break;
          }
        }
        if (ignore) continue;
        for (const searchTerm of this.searchTerms) {
          if (doesSearchTermMatchDiscount(searchTerm, discount)) {
            matchingDiscounts.push(discount);
            break;
          }
        }
      }
      const sortedMatchingDiscounts = matchingDiscounts.sort((d1, d2) => {
        return (
          d1.valid.toUnixTimestamp - d2.valid.toUnixTimestamp ||
          d1.valid.fromUnixTimestamp - d2.valid.fromUnixTimestamp
        );
      });

      let message = "*🛒 Kaufland \\- Discounts*\n";
      message += escapeMarkdown(this.description) + "\n\n";
      message += "\n";
      const prevSectionValidity = {
        from: undefined as string | undefined,
        to: undefined as string | undefined,
      };
      const discountIdsAlreadyIncluded: string[] = [];
      for (const discount of sortedMatchingDiscounts) {
        const discountId = getDiscountIdentifier(discount);
        if (discountIdsAlreadyIncluded.includes(discountId)) {
          // duplicate
          continue;
        }
        if (
          discount.valid.from !== prevSectionValidity.from ||
          discount.valid.to !== prevSectionValidity.to
        ) {
          prevSectionValidity.from = discount.valid.from;
          prevSectionValidity.to = discount.valid.to;
          message += validityFromToToMarkdown(
            discount.valid.from,
            discount.valid.to
          );
        }
        message += discountToMarkdown(discount);
        discountIdsAlreadyIncluded.push(discountId);
      }
      message += `\nScanned ${urls.length} URLs and ${discounts.length} discounts`;
      message += escapeMarkdown(` in ${(Date.now() - t0) / 1000} seconds`);
      message += errors ? escapeMarkdown(` (with ${errors} errors)`) : "";
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
  disclaimer: string | undefined;
  discount: string | undefined;
  oldPrice: string;
  price: string;
  valid: IValidFromTo;
}

async function getDiscountUrls(
  baseUrl: string,
  ignoreUrlPaths: string[]
): Promise<string[]> {
  const html = await fetch("GET", baseUrl + "/angebote/aktuelle-woche.html");

  const regexNavUrls = new RegExp(
    `<a class="o-navigation-main__link o-navigation-main__link--level-(?<level>\\d+)\\s*" role="menuitem" href="(?<url>[^"]*)"`,
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

  for (const furtherDiscountUrl of await findFurtherDiscountUrlsOnSubPagesSideAccordion(
    discountUrls,
    baseUrl,
    ignoreUrlPaths
  )) {
    discountUrls.push(furtherDiscountUrl);
  }
  for (const furtherDiscountUrl of await findFurtherDiscountUrlsOnSubPagesSeeAll(
    discountUrls,
    baseUrl,
    ignoreUrlPaths
  )) {
    discountUrls.push(furtherDiscountUrl);
  }

  return discountUrls;
}

async function findFurtherDiscountUrlsOnSubPagesSideAccordion(
  discountUrls: string[],
  baseUrl: string,
  ignoreUrlPaths: string[]
): Promise<string[]> {
  const furtherDiscountUrls: string[] = [];

  // for some discounts, there is a accordion on the page with further pages
  for (const discountUrl of discountUrls) {
    if (!discountUrl.endsWith("-woche.html")) continue;

    const html = await fetch("GET", discountUrl);
    const regexShowAllUrls = new RegExp(
      `<li class="m-accordion__item m-accordion__item--level-2( m-accordion__link--active|)">` +
        `\\s*<a href="(?<url>[^"]*)" class="m-accordion__link">`,
      "g"
    );
    let matchUrl;
    while ((matchUrl = regexShowAllUrls.exec(html))) {
      const url = matchUrl.groups.url;
      if (url.startsWith("/angebote/") && !ignoreUrlPaths.includes(url)) {
        furtherDiscountUrls.push(baseUrl + url);
      }
    }
  }

  return furtherDiscountUrls;
}

async function findFurtherDiscountUrlsOnSubPagesSeeAll(
  discountUrls: string[],
  baseUrl: string,
  ignoreUrlPaths: string[]
): Promise<string[]> {
  const furtherDiscountUrls: string[] = [];

  // for some discounts, there is a "see all" link on the page
  for (const discountUrl of discountUrls) {
    if (!discountUrl.endsWith("-woche.html")) continue;

    const html = await fetch("GET", discountUrl);
    const regexShowAllUrls = new RegExp(
      `<a class=" a-link a-link--icon-arrow a-link--underlined" href="(?<url>[^"]*)" target="_self" data-t-name="Link" title="Alle Angebote anzeigen">`,
      "g"
    );
    let matchUrl;
    while ((matchUrl = regexShowAllUrls.exec(html))) {
      const url = matchUrl.groups.url;
      if (url.startsWith("/angebote/") && !ignoreUrlPaths.includes(url)) {
        furtherDiscountUrls.push(baseUrl + url);
      }
    }
  }

  return furtherDiscountUrls;
}

async function getDiscounts(
  url: string,
  cookies: string = ""
): Promise<{ discounts: Array<IDiscount>; errors: number }> {
  let errors = 0;
  const html = await fetch("GET", url, undefined, {
    headers: { Cookie: cookies },
  });

  const regexValidFromTo = new RegExp(
    `<h\\d>Gültig vom (\\d{2}\\.\\d{2}\\.\\d{4}) bis (\\d{2}\\.\\d{2}\\.\\d{4})</h\\d>`
  );
  const matchValidFromTo = regexValidFromTo.exec(html);
  if (matchValidFromTo === null) {
    if (html.includes("liegen keine Angebote für die nächste Woche vor")) {
      return { discounts: [], errors };
    }
    throw new Error(`Failed to parse date valid_from/to (${url})`);
  }
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
      `\\s*<div class="a-pricetag[^\\"]*"[^>]*>` +
      `(\\s*<div class="a-pricetag__disclaimer">\\s*(?<disclaimer>.*[^\\s])\\s*</div>|)` +
      `(\\s*<div class="a-pricetag__discount">\\s*(?<discount>.*[^\\s])\\s*</div>|)` +
      `\\s*<div class="a-pricetag__price-container( |)">` +
      `\\s*<div class="a-pricetag__old-price">` +
      `\\s*<span class="a-pricetag__old-price a-pricetag__line-through">\\s*(?<oldPrice>.*[^\\s])\\s*</span>` +
      `(\\s*<span class="a-pricetag__currency">([^<]*)</span>|)` +
      `\\s*</div>` +
      `\\s*<div class="a-pricetag__price">\\s*(?<price>[^<]*[^\\s])\\s*(<.*>)?\\s*</div>`,
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

  const subtitleEntries = html.match(
    new RegExp(
      `<h5 class="m-offer-tile__subtitle">(?<subtitle>[^<]*)</h5>`,
      "g"
    )
  );
  if (discounts.length !== (subtitleEntries?.length || 0)) {
    // complete regex doesn't match for certain entries; find and log them to fix it
    for (const subtitleEntry of subtitleEntries) {
      const subtitle = subtitleEntry.split(">")[1].split("<")[0];
      if (!discounts.find((d) => d.subtitle === subtitle)) {
        console.log(
          "Discount Scanner Kaufland failed for",
          subtitle,
          `(${url})`
        );
        errors += 1;
      }
    }
  }

  return { discounts, errors };
}

function getDiscountIdentifier(discount: IDiscount) {
  return `${discount.title}:${discount.subtitle}:${discount.valid}`;
}

function dateStringToUnixTimestamp(dateString: string): number {
  const [day, month, year] = dateString.split(".");
  return Math.floor(
    new Date(Number(year), Number(month) - 1, Number(day)).getTime() / 1000
  );
}

function doesSearchTermMatchDiscount(
  searchTerm: string,
  discount: IDiscount
): boolean {
  const searchTermLowerCase = searchTerm.toLowerCase();
  return `${discount.subtitle} ${discount.title}`
    .toLowerCase()
    .includes(searchTermLowerCase);
}

function validityFromToToMarkdown(from: string, to: string) {
  return `🗓️ ${escapeMarkdown(from)} \\- ${escapeMarkdown(to)}\n`;
}

function discountToMarkdown(discount: IDiscount): string {
  return (
    `*${escapeMarkdown(discount.subtitle)} ${escapeMarkdown(
      discount.title || ""
    )}*\n` +
    `~${escapeMarkdown(discount.oldPrice)}~ ${escapeMarkdown(
      discount.price
    )} \\(${escapeMarkdown(discount.discount)}\\)\n` +
    `${escapeMarkdown(discount.quantity)} ${escapeMarkdown(
      discount.basicPrice
    )}\n` +
    `${
      discount.disclaimer ? `⚠ ${escapeMarkdown(discount.disclaimer)}\n` : ``
    }` +
    `\n`
  );
}

function escapeMarkdown(string: string | undefined): string {
  return (string || "").replace(/[_\*\[\]\(\)~`>#\+\-=\|\{\}\.!]/g, "\\$&");
}
