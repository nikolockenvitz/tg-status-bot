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
  }>;
}
