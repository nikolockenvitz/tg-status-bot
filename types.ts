export interface IDateSelection {
  [year: number]: {
    [month: number]: Number[];
  };
}

export interface IWebpageRegexMatcherConfig {
  webpages: Array<{
    url: string;
    message: string;
    regex: RegExp;
    resend?: boolean;
  }>;
}

export interface IWeeklyExecutionTime {
  day: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
  hour: number;
  minute: number;
}
