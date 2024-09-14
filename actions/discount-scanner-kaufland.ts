import { fetch } from "./general/utils";

import { TelegramBot } from "../telegram-bot";
import { AbstractAction } from "./general/abstract-action";
import * as executionTimeHelper from "./general/execution-time-helper";
import { IWeeklyExecutionTime } from "../types";
const config = require("./general/config-import");

export default class KauflandDiscountScanner extends AbstractAction {
  protected config: any;
  protected weeklyExecutionTime: IWeeklyExecutionTime;
  protected searchTerms: string[] = [];
  protected ignoreSearchTerms: string[] = [];
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
      const urls = getDiscountUrls();
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
          discount.valid.fromIso !== prevSectionValidity.from ||
          discount.valid.toIso !== prevSectionValidity.to
        ) {
          prevSectionValidity.from = discount.valid.fromIso;
          prevSectionValidity.to = discount.valid.toIso;
          message += validityFromToToMarkdown(
            discount.valid.fromIso,
            discount.valid.toIso
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
  fromIso: string;
  toIso: string;
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

function getDiscountUrls(): string[] {
  return [
    `https://filiale.kaufland.de/angebote/uebersicht.html?kloffer-week=current`,
    // `https://filiale.kaufland.de/angebote/uebersicht.html?kloffer-week=next`,
    // next week is already included in the JSON we parse
  ];
}

async function getDiscounts(
  url: string,
  cookies: string = ""
): Promise<{ discounts: Array<IDiscount>; errors: number }> {
  let errors = 0;
  const html = await fetch("GET", url, undefined, {
    headers: { Cookie: cookies },
  });

  try {
    const rawJsonStr =
      "{" +
      html.split(`= {"component":"OfferTemplate",`)[1].split("</script>")[0];
    const jsonDiscountData = JSON.parse(rawJsonStr).props.offerData;

    const discounts: IDiscount[] = [];
    for (const offer of jsonDiscountData?.loyalty?.offers ?? []) {
      const discount = parseOffer(offer);
      if (discount) discounts.push(discount);
      else errors += 1;
    }
    for (const cycle of jsonDiscountData.cycles) {
      for (const category of cycle.categories) {
        for (const offer of category.offers) {
          const discount = parseOffer(offer);
          if (discount) discounts.push(discount);
          else errors += 1;
        }
      }
    }

    return { discounts, errors };
  } catch (err) {
    errors += 1;
    console.warn("Couldn't parse discounts on", url);
    console.warn(err);
    return { discounts: [], errors };
  }
}

function parseOffer(offer: any): IDiscount | null {
  try {
    const fromIso = offer.dateFrom,
      toIso = offer.dateTo;
    return {
      title: offer.title ?? "",
      subtitle: offer.subtitle ?? "",
      valid: {
        fromIso,
        toIso,
        fromUnixTimestamp: isoDateStringToUnixTimestamp(fromIso),
        toUnixTimestamp: isoDateStringToUnixTimestamp(toIso),
      },
      price: (
        offer.loyaltyFormattedPrice ??
        offer.formattedPrice ??
        ""
      ).replace(/\*/g, ""),
      quantity: offer.unit ?? "",
      basicPrice: (
        offer.loyaltyFormattedBasePrice ??
        offer.basePrice ??
        ""
      ).replace(/\*/g, ""),
      discount: `-${offer.loyaltyDiscount || offer.discount || 0} %`,
      oldPrice: offer.loyaltyFormattedOldPrice ?? offer.formattedOldPrice ?? "",
    };
  } catch {
    return null;
  }
}

function getDiscountIdentifier(discount: IDiscount) {
  return `${discount.title}:${discount.subtitle}:${discount.valid}`;
}

function isoDateStringToUnixTimestamp(isoDateString: string): number {
  return Math.floor(new Date(isoDateString).getTime() / 1000);
}

function isoDateStringToDDMMYYY(isoDateString: string): string {
  const [yyyy, mm, dd] = isoDateString.split("-");
  return `${dd}.${mm}.${yyyy}`;
}

function doesSearchTermMatchDiscount(
  searchTerm: string,
  discount: IDiscount
): boolean {
  const searchTermLowerCase = searchTerm.toLowerCase();
  return `${discount.title} ${discount.subtitle}`
    .toLowerCase()
    .includes(searchTermLowerCase);
}

function validityFromToToMarkdown(fromIso: string, toIso: string) {
  return `🗓️ ${escapeMarkdown(
    isoDateStringToDDMMYYY(fromIso)
  )} \\- ${escapeMarkdown(isoDateStringToDDMMYYY(toIso))}\n`;
}

function discountToMarkdown(discount: IDiscount): string {
  return (
    `*${escapeMarkdown(discount.title)} ${escapeMarkdown(
      discount.subtitle || ""
    )}*\n` +
    `~${escapeMarkdown(discount.oldPrice)}~ ${escapeMarkdown(
      discount.price
    )} \\(${escapeMarkdown(discount.discount)}\\)\n` +
    `${escapeMarkdown(discount.quantity)} ${escapeMarkdown(
      discount.basicPrice
    )}\n` +
    `\n`
  );
}

function escapeMarkdown(string: string | undefined): string {
  return (string || "").replace(/[_\*\[\]\(\)~`>#\+\-=\|\{\}\.!]/g, "\\$&");
}
