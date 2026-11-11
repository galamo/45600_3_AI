import { z } from "zod";

export const flightSearchSchema = z.object({
  origin: z
    .string()
    .describe("Departure city or airport (e.g. San Francisco)"),
  destination: z
    .string()
    .describe("Arrival city or airport (e.g. Tokyo)"),
  date: z
    .string()
    .optional()
    .describe("Travel date (e.g. 2025-03-15) – optional"),
});

export const currencyExchangeSchema = z.object({
  pricesInDollar: z
    .array(z.string())
    .min(1)
    .describe(
      "List of prices in US Dollars to convert to NIS/ILS in one call. Pass every distinct USD flight price together instead of converting one at a time."
    ),
});

export const geocodeLocationSchema = z.object({
  placeName: z
    .string()
    .describe(
      "City or airport name to geocode (e.g. Tel Aviv, Tokyo, New York)"
    ),
});

export const countryFlagSchema = z.object({
  countryCodeOrName: z
    .string()
    .describe(
      "ISO 3166-1 alpha-2 country code (e.g. IL, JP, US) or country name (e.g. Israel, Japan)"
    ),
});

export const resolveLocationSchema = z.object({
  placeNames: z
    .array(z.string())
    .min(1)
    .describe(
      "List of city/airport names to resolve into coordinates, country code, and flag in one call. Pass both departure and destination together (e.g. [\"Tel Aviv\", \"Rome\"]) instead of resolving one at a time."
    ),
});

export type FlightSearchInput = z.infer<typeof flightSearchSchema>;
export type CurrencyExchangeInput = z.infer<typeof currencyExchangeSchema>;
export type GeocodeLocationInput = z.infer<typeof geocodeLocationSchema>;
export type CountryFlagInput = z.infer<typeof countryFlagSchema>;
export type ResolveLocationInput = z.infer<typeof resolveLocationSchema>;
