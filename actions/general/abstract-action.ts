import { TelegramBot } from "../../telegram-bot";

export abstract class AbstractAction {
  public name: string;
  abstract getNextExecutionTime(lastExecutionTime: Date): Date;
  abstract async run(data: any, bot: TelegramBot): Promise<void>;
}
