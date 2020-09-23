import { TelegramBot } from "../../telegram-bot";

export abstract class AbstractAction {
  public name: string;
  abstract getNextExecutionTime(lastExecutionTime: Date, lastSuccessfulExecutionTime: Date): Date;
  isEnabled(): boolean {
    return true;
  }
  abstract async run(data: any, bot: TelegramBot): Promise<boolean>;
}
