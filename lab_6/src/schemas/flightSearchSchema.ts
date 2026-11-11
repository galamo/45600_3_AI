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

export type FlightSearchInput = z.infer<typeof flightSearchSchema>;
export type CurrencyExchangeInput = z.infer<typeof currencyExchangeSchema>;
