import { tool } from "@langchain/core/tools";
import { geocodeLocationSchema } from "../schemas/flightSearchSchema.js";
import { fetchCoordinates } from "../services/flightApiService.js";

export const geocodeLocationTool = tool(
  async ({ placeName }) => {
    const coords = await fetchCoordinates(placeName);
    if (!coords) {
      return JSON.stringify({ error: `No coordinates found for "${placeName}"` });
    }
    return JSON.stringify(coords);
  },
  {
    name: "geocode_location",
    description:
      "Convert a city or airport name into latitude, longitude, country name, and ISO country code (countryCode). Use for both departure and destination so the client can place them on a map.",
    schema: geocodeLocationSchema,
  }
);
