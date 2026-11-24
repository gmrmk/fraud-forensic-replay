import { describe, it, expect } from "vitest";
import { toMgrs } from "./mgrs";

// Expected strings: easting/northing computed independently with pyproj 3.7.2
// (EPSG:326xx/327xx, zone picked by the standard rules incl. Norway/Svalbard) in the
// backend venv, then truncated (MGRS truncates, never rounds) and lettered by a
// separate Python implementation of the 100 km AA scheme. The two published
// references below validate the letters against sources outside this repo.
const POINTS: [string, number, number, string][] = [
  ["Houston Pump 4", 29.7799, -95.546, "15R TN 53862 97114"],
  ["Lagos Lekki", 6.44, 3.47, "31N EH 51971 11867"],
  ["equator / prime meridian", 0, 0, "31N AA 66021 00000"],
  ["Sydney (south)", -33.8688, 151.2093, "56H LH 34368 50948"],
  ["Oslo (32V)", 59.9139, 10.7522, "32V NM 97979 43118"],
  ["Bergen (32V exception)", 60.3913, 5.3221, "32V KN 97353 00648"],
  ["Longyearbyen (33X)", 78.2232, 15.6267, "33X WG 14278 83355"],
  ["Svalbard 31X", 74, 4, "31X EC 30765 12296"],
  ["Svalbard 37X", 76, 38, "37X DE 72996 35414"],
  ["Buenos Aires", -34.6037, -58.3816, "21H UB 73317 70036"],
  ["Tokyo", 35.6762, 139.6503, "54S UE 77855 48874"],
  ["Anchorage", 61.2181, -149.9003, "6V UN 44247 90536"],
  ["band C (-79.9)", -79.9, 20, "34C DS 80423 29407"],
  ["band X (83.9)", 83.9, -40, "24X VU 88136 17033"],
];

describe("toMgrs", () => {
  it.each(POINTS)("%s", (_name, lat, lng, expected) => {
    expect(toMgrs(lat, lng)).toBe(expected);
  });

  // Published reference 1: Chris Veness, https://www.movable-type.co.uk/scripts/latlong-utm-mgrs.html
  // "31 N 303760 5787415" converts to "31U CT 03760 87415". The lat/lng is the pyproj
  // inverse of the 1 m cell centre (303760.5, 5787415.5), so truncation lands on that cell.
  it("matches the Veness published UTM->MGRS example", () => {
    expect(toMgrs(52.202201261644205, 0.12821810231026684)).toBe("31U CT 03760 87415");
  });

  // Published reference 2: Wikipedia "Military Grid Reference System" gives the example
  // "4Q FJ 1234 6789" (Honolulu, 10 m resolution). lat/lng = pyproj inverse of the
  // cell centre E 612345 / N 2367895 in EPSG:32604.
  it("matches the Wikipedia published 4Q FJ 1234 6789 example", () => {
    expect(toMgrs(21.409841840145504, -157.91608084107511, 4)).toBe("4Q FJ 1234 6789");
  });

  it("honours precision", () => {
    expect(toMgrs(29.7799, -95.546, 3)).toBe("15R TN 538 971");
    expect(toMgrs(29.7799, -95.546, 0)).toBe("15R TN");
  });

  it("returns null outside 80S..84N and for non-finite input", () => {
    expect(toMgrs(-80.5, 0)).toBeNull();
    expect(toMgrs(84.5, 0)).toBeNull();
    expect(toMgrs(NaN, 0)).toBeNull();
  });
});
