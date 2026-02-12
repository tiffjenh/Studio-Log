/** Currency option for rate picker. USD is first so it's the default. */
export interface CurrencyOption {
  code: string;
  symbol: string;
  name: string;
}

/** Comprehensive list of currencies (ISO 4217–style). USD first as default. */
export const CURRENCY_LIST: CurrencyOption[] = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "MXN", symbol: "$", name: "Mexican Peso" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "KRW", symbol: "₩", name: "South Korean Won" },
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona" },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone" },
  { code: "DKK", symbol: "kr", name: "Danish Krone" },
  { code: "PLN", symbol: "zł", name: "Polish Złoty" },
  { code: "THB", symbol: "฿", name: "Thai Baht" },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah" },
  { code: "HUF", symbol: "Ft", name: "Hungarian Forint" },
  { code: "CZK", symbol: "Kč", name: "Czech Koruna" },
  { code: "ILS", symbol: "₪", name: "Israeli Shekel" },
  { code: "CLP", symbol: "$", name: "Chilean Peso" },
  { code: "PHP", symbol: "₱", name: "Philippine Peso" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "COP", symbol: "$", name: "Colombian Peso" },
  { code: "SAR", symbol: "﷼", name: "Saudi Riyal" },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit" },
  { code: "RON", symbol: "lei", name: "Romanian Leu" },
  { code: "TRY", symbol: "₺", name: "Turkish Lira" },
  { code: "EGP", symbol: "E£", name: "Egyptian Pound" },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira" },
  { code: "PKR", symbol: "₨", name: "Pakistani Rupee" },
  { code: "BGN", symbol: "лв", name: "Bulgarian Lev" },
  { code: "HRK", symbol: "kn", name: "Croatian Kuna" },
  { code: "RUB", symbol: "₽", name: "Russian Ruble" },
  { code: "UAH", symbol: "₴", name: "Ukrainian Hryvnia" },
  { code: "VND", symbol: "₫", name: "Vietnamese Dong" },
  { code: "ARS", symbol: "$", name: "Argentine Peso" },
  { code: "PEN", symbol: "S/", name: "Peruvian Sol" },
  { code: "TWD", symbol: "NT$", name: "New Taiwan Dollar" },
  { code: "BDT", symbol: "৳", name: "Bangladeshi Taka" },
  { code: "MAD", symbol: "د.م.", name: "Moroccan Dirham" },
  { code: "QAR", symbol: "﷼", name: "Qatari Riyal" },
  { code: "KWD", symbol: "د.ك", name: "Kuwaiti Dinar" },
  { code: "BHD", symbol: ".د.ب", name: "Bahraini Dinar" },
  { code: "OMR", symbol: "﷼", name: "Omani Rial" },
  { code: "JOD", symbol: "د.ا", name: "Jordanian Dinar" },
  { code: "LBP", symbol: "ل.ل", name: "Lebanese Pound" },
  { code: "ISK", symbol: "kr", name: "Icelandic Króna" },
  { code: "RSD", symbol: "дин.", name: "Serbian Dinar" },
  { code: "LKR", symbol: "Rs", name: "Sri Lankan Rupee" },
  { code: "NPR", symbol: "₨", name: "Nepalese Rupee" },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling" },
  { code: "GHS", symbol: "₵", name: "Ghanaian Cedi" },
  { code: "TZS", symbol: "TSh", name: "Tanzanian Shilling" },
  { code: "UGX", symbol: "USh", name: "Ugandan Shilling" },
  { code: "ETB", symbol: "Br", name: "Ethiopian Birr" },
  { code: "DZD", symbol: "د.ج", name: "Algerian Dinar" },
  { code: "TND", symbol: "د.ت", name: "Tunisian Dinar" },
  { code: "JMD", symbol: "J$", name: "Jamaican Dollar" },
  { code: "TTD", symbol: "TT$", name: "Trinidad and Tobago Dollar" },
  { code: "BBD", symbol: "Bds$", name: "Barbadian Dollar" },
  { code: "XAF", symbol: "FCFA", name: "Central African CFA Franc" },
  { code: "XOF", symbol: "CFA", name: "West African CFA Franc" },
  { code: "UYU", symbol: "$U", name: "Uruguayan Peso" },
  { code: "BOB", symbol: "Bs.", name: "Bolivian Boliviano" },
  { code: "PYG", symbol: "₲", name: "Paraguayan Guaraní" },
  { code: "GTQ", symbol: "Q", name: "Guatemalan Quetzal" },
  { code: "DOP", symbol: "RD$", name: "Dominican Peso" },
  { code: "HNL", symbol: "L", name: "Honduran Lempira" },
  { code: "NIO", symbol: "C$", name: "Nicaraguan Córdoba" },
  { code: "CRC", symbol: "₡", name: "Costa Rican Colón" },
  { code: "PAB", symbol: "B/.", name: "Panamanian Balboa" },
  { code: "CUP", symbol: "$", name: "Cuban Peso" },
  { code: "UZS", symbol: "so'm", name: "Uzbekistani Som" },
  { code: "AZN", symbol: "₼", name: "Azerbaijani Manat" },
  { code: "GEL", symbol: "₾", name: "Georgian Lari" },
  { code: "AMD", symbol: "֏", name: "Armenian Dram" },
  { code: "KZT", symbol: "₸", name: "Kazakhstani Tenge" },
  { code: "KGS", symbol: "с", name: "Kyrgyzstani Som" },
  { code: "TMT", symbol: "m", name: "Turkmenistani Manat" },
  { code: "TJS", symbol: "SM", name: "Tajikistani Somoni" },
  { code: "AFN", symbol: "؋", name: "Afghan Afghani" },
  { code: "MMK", symbol: "K", name: "Myanmar Kyat" },
  { code: "KHR", symbol: "៛", name: "Cambodian Riel" },
  { code: "LAK", symbol: "₭", name: "Lao Kip" },
  { code: "MNT", symbol: "₮", name: "Mongolian Tugrik" },
  { code: "BND", symbol: "B$", name: "Brunei Dollar" },
  { code: "MUR", symbol: "₨", name: "Mauritian Rupee" },
  { code: "BWP", symbol: "P", name: "Botswana Pula" },
  { code: "ZMW", symbol: "ZK", name: "Zambian Kwacha" },
  { code: "XCD", symbol: "EC$", name: "East Caribbean Dollar" },
  { code: "BMD", symbol: "BD$", name: "Bermudian Dollar" },
  { code: "BZD", symbol: "BZ$", name: "Belize Dollar" },
  { code: "GYD", symbol: "G$", name: "Guyanese Dollar" },
  { code: "SRD", symbol: "$", name: "Surinamese Dollar" },
  { code: "MKD", symbol: "ден", name: "Macedonian Denar" },
  { code: "ALL", symbol: "L", name: "Albanian Lek" },
  { code: "BAM", symbol: "KM", name: "Bosnia-Herzegovina Convertible Mark" },
  { code: "MDL", symbol: "L", name: "Moldovan Leu" },
  { code: "GIP", symbol: "£", name: "Gibraltar Pound" },
  { code: "FJD", symbol: "FJ$", name: "Fijian Dollar" },
  { code: "PGK", symbol: "K", name: "Papua New Guinean Kina" },
  { code: "SBD", symbol: "SI$", name: "Solomon Islands Dollar" },
  { code: "VUV", symbol: "VT", name: "Vanuatu Vatu" },
  { code: "WST", symbol: "WS$", name: "Samoan Tala" },
  { code: "TOP", symbol: "T$", name: "Tongan Paʻanga" },
  { code: "LSL", symbol: "L", name: "Lesotho Loti" },
  { code: "NAD", symbol: "N$", name: "Namibian Dollar" },
  { code: "SZL", symbol: "E", name: "Swazi Lilangeni" },
  { code: "MVR", symbol: "Rf", name: "Maldivian Rufiyaa" },
  { code: "CVE", symbol: "$", name: "Cape Verdean Escudo" },
  { code: "AWG", symbol: "ƒ", name: "Aruban Florin" },
  { code: "BSD", symbol: "B$", name: "Bahamian Dollar" },
  { code: "KYD", symbol: "CI$", name: "Cayman Islands Dollar" },
  { code: "SHP", symbol: "£", name: "Saint Helena Pound" },
  { code: "FKP", symbol: "£", name: "Falkland Islands Pound" },
];

export const DEFAULT_CURRENCY_CODE = "USD";

export function getCurrencyByCode(code: string): CurrencyOption | undefined {
  return CURRENCY_LIST.find((c) => c.code === code);
}

export function getCurrencyBySymbol(symbol: string): CurrencyOption | undefined {
  return CURRENCY_LIST.find((c) => c.symbol === symbol);
}

/** Filter list by code, symbol, or name (case-insensitive). */
export function filterCurrencies(query: string): CurrencyOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return CURRENCY_LIST;
  return CURRENCY_LIST.filter(
    (c) =>
      c.code.toLowerCase().includes(q) ||
      c.symbol.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q)
  );
}

const CURRENCY_STORAGE_KEY = "studio-log-currency-code";

/** Default currency from Settings (localStorage). Used by rate picker on Add/Edit student. */
export function getStoredCurrencyCode(): string {
  if (typeof window === "undefined") return DEFAULT_CURRENCY_CODE;
  const stored = localStorage.getItem(CURRENCY_STORAGE_KEY);
  return stored && getCurrencyByCode(stored) ? stored : DEFAULT_CURRENCY_CODE;
}

export function setStoredCurrencyCode(code: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CURRENCY_STORAGE_KEY, code);
}
