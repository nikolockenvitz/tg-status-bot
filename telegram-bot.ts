const { Telegraf } = require("telegraf");

export class TelegramBot {
  private bot: typeof Telegraf;

  constructor(private updateTimes: any) {
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
        message += `*${actionName}*: ${formatDate(this.updateTimes[actionName])}\n`;
      }
      ctx.replyWithMarkdown(message || "No data available yet");
    });

    this.bot.telegram.setMyCommands([
      {
        command: "lastupdate",
        description: "Returns time of most recent execution",
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

function formatDate(date: Date): string {
  return "HH:mm (WWW DD.MM.)"
    .replace("YYYY", pad(date.getFullYear(), 4))
    .replace("MM", pad(date.getMonth() + 1, 2))
    .replace("DD", pad(date.getDate(), 2))
    .replace("HH", pad(date.getHours(), 2))
    .replace("mm", pad(date.getMinutes(), 2))
    .replace("ss", pad(date.getSeconds(), 2))
    .replace("WWW", ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()])
    .replace("WWWW", ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()]);
}

function pad(text: string | number, length: number, padChar = "0", padFront = true) {
  text = String(text);
  const padChars = padChar.repeat(length - text.length).substr(0, length - text.length);
  return padFront ? padChars + text : text + padChars;
}
