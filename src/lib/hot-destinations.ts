// Hot destinations — top global hubs that always appear as markers on the globe.
// Curated for visual balance across continents.
import { AIRPORT_COORDS } from "./airports";

export type HotDestination = {
  iata: string;
  city: string;
  lat: number;
  lng: number;
};

const HUBS: { iata: string; city: string }[] = [
  // Asia
  { iata: "PVG", city: "Shanghai" },
  { iata: "PEK", city: "Beijing" },
  { iata: "HKG", city: "Hong Kong" },
  { iata: "NRT", city: "Tokyo" },
  { iata: "ICN", city: "Seoul" },
  { iata: "SIN", city: "Singapore" },
  { iata: "BKK", city: "Bangkok" },
  { iata: "DEL", city: "Delhi" },
  { iata: "DXB", city: "Dubai" },
  // Europe
  { iata: "LHR", city: "London" },
  { iata: "CDG", city: "Paris" },
  { iata: "FRA", city: "Frankfurt" },
  { iata: "AMS", city: "Amsterdam" },
  { iata: "IST", city: "Istanbul" },
  { iata: "MAD", city: "Madrid" },
  // Americas
  { iata: "JFK", city: "New York" },
  { iata: "LAX", city: "Los Angeles" },
  { iata: "SFO", city: "San Francisco" },
  { iata: "ORD", city: "Chicago" },
  { iata: "GRU", city: "São Paulo" },
  // Oceania / Africa
  { iata: "SYD", city: "Sydney" },
  { iata: "JNB", city: "Johannesburg" },
  { iata: "CAI", city: "Cairo" },
];

export const HOT_DESTINATIONS: HotDestination[] = HUBS.flatMap((h) => {
  const c = AIRPORT_COORDS[h.iata];
  return c ? [{ ...h, lat: c.lat, lng: c.lng }] : [];
});

// Popular routes — curated network of well-known long-haul + regional pairs.
// Renders as faint ambient arcs (background context, not active search).
export type PopularRoute = { from: string; to: string };

export const POPULAR_ROUTES: PopularRoute[] = [
  ["PVG", "NRT"],
  ["PVG", "LAX"],
  ["PVG", "FRA"],
  ["PEK", "LHR"],
  ["HKG", "SIN"],
  ["HKG", "SYD"],
  ["NRT", "LAX"],
  ["NRT", "SFO"],
  ["ICN", "JFK"],
  ["SIN", "LHR"],
  ["DXB", "LHR"],
  ["DXB", "JFK"],
  ["DXB", "SYD"],
  ["LHR", "JFK"],
  ["LHR", "SFO"],
  ["CDG", "JFK"],
  ["FRA", "ORD"],
  ["IST", "JFK"],
  ["DEL", "DXB"],
  ["GRU", "JFK"],
  ["GRU", "MAD"],
  ["JNB", "LHR"],
  ["SYD", "LAX"],
  ["BKK", "DXB"],
].map(([from, to]) => ({ from, to }));
