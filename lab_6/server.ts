import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  flightPlannerAgent,
  printAgentRunSummary,
} from "./src/agents/flightPlannerAgent.js";
import { resolveLocation } from "./src/services/flightApiService.js";
import type { FlightPlace, TravelPlanResponse } from "./src/types/flight.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

function placeNeedsEnrichment(place?: FlightPlace): boolean {
  if (!place?.name) return false;
  const lat = place.lat ?? place.latitude;
  const lon = place.lon ?? place.long ?? place.longitude;
  return lat == null || lon == null || !place.flag || !place.countryCode;
}

async function enrichPlace(place?: FlightPlace): Promise<FlightPlace | undefined> {
  if (!place?.name) return place;
  if (!placeNeedsEnrichment(place)) {
    return {
      ...place,
      lat: place.lat ?? place.latitude,
      lon: place.lon ?? place.long ?? place.longitude,
    };
  }

  const resolved = await resolveLocation(place.name);
  if (!resolved) return place;

  return {
    name: place.name || resolved.name,
    lat: place.lat ?? place.latitude ?? resolved.lat,
    lon: place.lon ?? place.long ?? place.longitude ?? resolved.lon,
    countryCode: place.countryCode || resolved.countryCode,
    flag: place.flag || resolved.flag,
  };
}

async function enrichTravelPlan(
  plan: TravelPlanResponse
): Promise<TravelPlanResponse> {
  const [from, to] = await Promise.all([
    enrichPlace(plan.from),
    enrichPlace(plan.to),
  ]);
  return {
    ...plan,
    from: from ?? plan.from,
    to: to ?? plan.to,
  };
}

function parseAgentJson(content: string): TravelPlanResponse {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as TravelPlanResponse;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Agent response was not valid JSON");
    return JSON.parse(match[0]) as TravelPlanResponse;
  }
}

app.post("/api/chat", async (req, res) => {
  try {
    const { message, departure, destination, style, budget, interests } =
      req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    let fullMessage = message;
    if (departure || destination || style || budget || interests) {
      fullMessage = `Plan a 3-day trip.\n\n`;
      if (departure) fullMessage += `Departure city: ${departure}\n`;
      if (destination) fullMessage += `Destination city: ${destination}\n`;
      if (style) fullMessage += `Travel style: ${style}\n`;
      if (budget) fullMessage += `Budget level: ${budget}\n`;
      if (interests) fullMessage += `Special interests: ${interests}\n`;
      fullMessage += `\nAdditional request: ${message}`;
    }

    const result = await flightPlannerAgent.invoke({
      messages: [{ role: "user", content: fullMessage }],
    });

    printAgentRunSummary(result);

    const lastMessage = result.messages[result.messages.length - 1];
    const responseContent =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

    const parsed = parseAgentJson(responseContent);

    // Ensure from/to always have coords + countryCode + flag for the map
    if (!parsed.from?.name && departure) {
      parsed.from = { name: departure };
    }
    if (!parsed.to?.name && destination) {
      parsed.to = { name: destination };
    }

    const enriched = await enrichTravelPlan(parsed);

    res.json({
      success: true,
      response: enriched,
    });
  } catch (error) {
    const err = error as Error;
    console.error("Error processing chat request:", err);
    res.status(500).json({
      success: false,
      error: "Failed to process chat request",
      details: err.message,
    });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", message: "Travel Planner API is running" });
});

app.listen(PORT, () => {
  console.log(`🚀 Travel Planner API server running on http://localhost:${PORT}`);
  console.log(`📍 API endpoint: http://localhost:${PORT}/api/chat`);
  console.log(`💚 Health endpoint: http://localhost:${PORT}/api/health`);
});
