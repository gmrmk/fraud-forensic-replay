/** The map's attribution, for OpenFreeMap licensing compliance: real clickable
 *  links (debt-program Phase 2, item E). The basemap is OpenFreeMap (hosted OSM
 *  vector). OSM data is ODbL, so the OpenStreetMap + OpenMapTiles credit is
 *  REQUIRED (not optional); the OpenFreeMap link is encouraged. Canonical string
 *  per openfreemap.org: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap".
 *  The map's own attribution control is off.
 *
 *  The case renders this as the top row of its bottom
 *  stack (the case), so its bottom edge touches the panel below it
 *  and it never sits on that panel. It is as wide as its text and has a flat
 *  backing in the surface colour: with none, street labels ran through it at
 *  city zoom (FIX-2026-11-14-map-credit-unreadable-over-street-tiles). The
 *  strip stays pointer-events-none; only the <a> captures the pointer. */
export function MapCredit() {
  return (
    <div
      data-map-credit
      className="font-mono text-[9px] tracking-widest text-muted pointer-events-none flex w-fit items-center gap-1 h-[18px] px-1.5 bg-panel-bg"
    >
      <a
        href="https://openfreemap.org"
        target="_blank"
        rel="noreferrer"
        className="pointer-events-auto hover:text-accent transition"
      >
        OpenFreeMap
      </a>
      <span className="text-[color:var(--text)]">©</span>
      <a
        href="https://www.openmaptiles.org/"
        target="_blank"
        rel="noreferrer"
        className="pointer-events-auto hover:text-accent transition"
      >
        OpenMapTiles
      </a>
      <span>Data from</span>
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="pointer-events-auto hover:text-accent transition"
      >
        OpenStreetMap
      </a>
    </div>
  );
}
