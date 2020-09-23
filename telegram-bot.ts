const { Telegraf } = require("telegraf");
import { formatDate } from "./actions/general/utils";

export class TelegramBot {
  private bot: typeof Telegraf;

  constructor(
    private actionsEnabledStatus: { [actionName: string]: boolean },
    private updateTimes: any,
    private lastSuccessfulUpdateTimes: any
  ) {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    this.bot.use((ctx, next) => {
      if (Number(ctx.chat.id) === Number(process.env.TELEGRAM_MY_CHAT_ID)) {
        next();
      } else {
        const stickers = {
          doge: "CAADAQADBQQAAnEW1gS5AnHOr0EuFgI",
          musk: "CAADAgADhggAAnlc4gn26HiRm2MMtwI",
          duck: "CAACAgIAAxkBAAOKX2e7jTmHJS1dhSoGQROJKGXjuY0AAvsAA1advQpWDtsz28rJ5hsE",
          niffler: "CAACAgIAAxkBAAOMX2e7vpisFcmFMfwTYgk56bctMtsAAgoEAALEq2gLK4MVobLqfYIbBA",
          police: "CAACAgIAAxkBAAOOX2e8Ki5soilOfoeUdDZDkvBkSiYAAnoDAAL6C7YI8vwuKShGg_gbBA",
        };
        ctx.replyWithSticker(Object.values(stickers)[Math.floor(Math.random() * Object.keys(stickers).length)]);
      }
    });

    this.bot.command("/lastupdate", async (ctx) => {
      let message = "";
      for (const actionName in this.updateTimes) {
        message += `*${actionName}*: ${formatDate(this.updateTimes[actionName], "HH:mm (WWW DD.MM.)")}`;
        if (this.updateTimes[actionName].getTime() !== this.lastSuccessfulUpdateTimes[actionName].getTime()) {
          message += ` ⚠️ last successful: ${formatDate(this.lastSuccessfulUpdateTimes[actionName], "HH:mm (WWW DD.MM.)")}`;
        } else {
          message += ` ✅️`;
        }
        message += `\n`;
      }
      ctx.replyWithMarkdown(message || "No data available yet");
    });

    this.bot.command("/actions", async (ctx) => {
      let message = "";
      for (const actionName in this.actionsEnabledStatus) {
        message += `${this.actionsEnabledStatus[actionName] ? "✅️" : "⛔️"} ${actionName}\n`;
      }
      ctx.replyWithMarkdown(message || "No actions found");
    });

    this.bot.telegram.setMyCommands([
      {
        command: "actions",
        description: "List of all actions",
      },
      {
        command: "lastupdate",
        description: "Time of most recent execution per action",
      },
    ]);

    this.bot.launch();

    this.bot.telegram.getMe().then((botInfo) => {
      console.log(`Telegram Bot @${botInfo.username} started`);
    });
  }

  send(message: string) {
    this.bot.telegram.sendMessage(process.env.TELEGRAM_MY_CHAT_ID, message);
  }
}
