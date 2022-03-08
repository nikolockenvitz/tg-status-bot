import KauflandDiscountScanner from "./discount-scanner-kaufland";
const config = require("./general/config-import");

export default class KauflandDiscountScannerConf2 extends KauflandDiscountScanner {
  constructor() {
    super();
    this.config = config.DISCOUNT_SCANNER_KAUFLAND_2;
    this.readConfig();
  }
}
