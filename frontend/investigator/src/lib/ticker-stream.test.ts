import { describe, it, expect } from "vitest";
import type { ScenarioNode } from "./scenarios";
import { buildTickerStream } from "./ticker-stream";
// The shipped manifests ARE the contract: node.primary/secondary are
// ${field} TEMPLATE strings ("$${amount} · ${merchant_name}"), never
// bare field keys. Loaded raw from the real backend files so a manifest
// drift breaks this suite instead of shipping an empty ticker - the
// prior bare-key fixtures matched no shipped manifest and kept the
// suite green while every live row rendered primary="" secondary="".
// Every scenario file in the folder is read, not three by name, so the suite
// pins whatever manifests a tree holds (a copy of the repository may hold fewer).
const rawManifests = import.meta.glob<string>("../../../../backend/scenarios/*.scenario.json", {
  query: "?raw",
  import: "default",
  eager: true,
});

interface ManifestShape {
  id: string;
  nodes: ScenarioNode[];
}

const manifests = Object.values(rawManifests).map((raw) => JSON.parse(raw) as ManifestShape);

function manifestById(id: string): ManifestShape {
  const found = manifests.find((m) => m.id === id);
  if (!found) throw new Error(`no scenario file with id ${id} under backend/scenarios`);
  return found;
}

const cardFraudManifest = manifestById("card-fraud");
const priyaManifest = manifestById("priya-ato");

function nodeFor(manifest: ManifestShape, kind: string): ScenarioNode {
  const node = manifest.nodes.find((n) => n.kind === kind);
  if (!node) throw new Error(`${manifest.id} manifest is missing the ${kind} node`);
  return node;
}

// Two schemas, per the schema-agnostic seam: a card-fraud node and an
// ATO login node. Fixture templates mirror the shipped card-fraud
// manifest shapes exactly; the real-manifest suite below pins the
// actual files.
const authNode: ScenarioNode = {
  kind: "auth",
  label: "Card auth",
  palette: "auth",
  source: "transactions",
  timestamp: "timestamp",
  primary: "$${amount} · ${merchant_name}",
  secondary: "${mcc} · ${merchant_country}",
};

const loginNode: ScenarioNode = {
  kind: "login",
  label: "Login",
  palette: "login",
  source: "login_events",
  timestamp: "timestamp",
  primary: "${device_fp}",
  secondary: "${outcome} · ${ip_type}",
};

// Ambient reference geometry - the manifest declares NO timestamp
// field, so places are not events and never enter the stream.
const placeNode: ScenarioNode = {
  kind: "place",
  label: "Place",
  palette: "place",
  source: "places",
  primary: "${name}",
  secondary: "${category}",
};

describe("buildTickerStream", () => {
  it("merges rows across kinds into one ascending time-ordered stream", () => {
    const byKind = {
      auth: [
        // Deliberately out of order within the kind.
        {
          id: "t2",
          timestamp: "2026-05-26T12:00:00-05:00",
          merchant_name: "Vinyl Vault",
          amount: 13.59,
          mcc: "5999",
          merchant_country: "US",
        },
        {
          id: "t1",
          timestamp: "2026-05-26T08:00:00-05:00",
          merchant_name: "Daily Grind",
          amount: 4.75,
          mcc: "5812",
          merchant_country: "US",
        },
      ],
      login: [
        {
          id: "l1",
          timestamp: "2026-05-26T10:00:00-05:00",
          device_fp: "Handset-Browser-A1F8",
          outcome: "success",
          ip_type: "residential",
        },
      ],
    };

    const stream = buildTickerStream(byKind, [authNode, loginNode]);

    expect(stream.map((item) => item.id)).toEqual(["t1", "l1", "t2"]);
    expect(stream.map((item) => item.kind)).toEqual(["auth", "login", "auth"]);
    // Each item carries its manifest node so the consumer renders
    // label/palette from metadata, not from hardcoded kind switches.
    expect(stream[0].node).toBe(authNode);
    expect(stream[1].node).toBe(loginNode);
    expect(stream[0].primary).toBe("$4.75 · Daily Grind");
    expect(stream[1].primary).toBe("Handset-Browser-A1F8");
    expect(stream[0].ts).toBe("2026-05-26T08:00:00-05:00");
    expect(stream[0].raw).toBe(byKind.auth[1]);
  });

  it("resolves a compound ${field} template: amount + merchant survive in one slot", () => {
    const stream = buildTickerStream(
      {
        auth: [
          {
            id: "t2",
            timestamp: "2026-05-26T12:00:00-05:00",
            merchant_name: "Vinyl Vault",
            amount: 13.59,
            mcc: "5999",
            merchant_country: "US",
          },
        ],
      },
      [authNode],
    );

    expect(stream).toHaveLength(1);
    expect(stream[0].primary).toBe("$13.59 · Vinyl Vault");
    expect(stream[0].secondary).toBe("5999 · US");
  });

  it("pads a money-named field to two decimals by field-name pattern: 890.5 -> 890.50", () => {
    const stream = buildTickerStream(
      {
        auth: [
          {
            id: "f1",
            timestamp: "2026-05-27T03:12:00-05:00",
            merchant_name: "Heskford Lekki",
            amount: 890.5,
            mcc: "5411",
            merchant_country: "NG",
          },
        ],
      },
      [authNode],
    );

    expect(stream[0].primary).toBe("$890.50 · Heskford Lekki");
  });

  it("passes non-money template fields through unformatted", () => {
    const stream = buildTickerStream(
      {
        login: [
          {
            id: "l1",
            timestamp: "2026-05-26T10:00:00-05:00",
            device_fp: "Handset-Browser-A1F8",
            outcome: "challenged",
            ip_type: "vpn",
          },
        ],
      },
      [loginNode],
    );

    expect(stream).toHaveLength(1);
    expect(stream[0].secondary).toBe("challenged · vpn");
  });

  it("does NOT decimal-pad a money-named field whose value is not a finite number", () => {
    const stream = buildTickerStream(
      {
        auth: [
          {
            id: "t1",
            timestamp: "2026-05-26T08:00:00-05:00",
            merchant_name: "Daily Grind",
            amount: "13.5", // string, not a finite number - verbatim, no toFixed
            mcc: "5812",
            merchant_country: "US",
          },
        ],
      },
      [authNode],
    );

    expect(stream[0].primary).toBe("$13.5 · Daily Grind");
  });

  it("renders a null/missing template field as the empty string in its slot", () => {
    // Single-field secondary (the shipped priya-ato login shape).
    const singleFieldLogin: ScenarioNode = { ...loginNode, secondary: "${outcome}" };
    const stream = buildTickerStream(
      {
        login: [
          {
            id: "l1",
            timestamp: "2026-05-26T10:00:00-05:00",
            device_fp: "Handset-Browser-A1F8",
            outcome: null,
          },
        ],
      },
      [singleFieldLogin],
    );

    expect(stream[0].secondary).toBe("");
  });

  it("renders a no-placeholder template verbatim and an absent template as empty", () => {
    const literalNode: ScenarioNode = { ...loginNode, primary: "session", secondary: undefined };
    const stream = buildTickerStream(
      {
        login: [{ id: "l1", timestamp: "2026-05-26T10:00:00-05:00" }],
      },
      [literalNode],
    );

    expect(stream[0].primary).toBe("session");
    expect(stream[0].secondary).toBe("");
  });

  it("contributes nothing for a node with no timestamp field (places are ambient)", () => {
    const stream = buildTickerStream(
      {
        place: [{ id: "p1", name: "Houston Galleria" }],
        auth: [
          {
            id: "t1",
            timestamp: "2026-05-26T08:00:00-05:00",
            merchant_name: "Daily Grind",
            amount: 4.75,
            mcc: "5812",
            merchant_country: "US",
          },
        ],
      },
      [placeNode, authNode],
    );

    expect(stream.map((item) => item.kind)).toEqual(["auth"]);
  });

  it("skips kinds in byKind that no node declares (absence-as-data)", () => {
    const stream = buildTickerStream(
      {
        webhook: [{ id: "w1", timestamp: "2026-05-26T09:00:00-05:00" }],
        auth: [
          {
            id: "t1",
            timestamp: "2026-05-26T08:00:00-05:00",
            merchant_name: "Daily Grind",
            amount: 4.75,
            mcc: "5812",
            merchant_country: "US",
          },
        ],
      },
      [authNode],
    );

    expect(stream.map((item) => item.id)).toEqual(["t1"]);
  });

  it("returns [] for empty inputs", () => {
    expect(buildTickerStream({}, [])).toEqual([]);
    expect(buildTickerStream({}, [authNode, loginNode])).toEqual([]);
    expect(buildTickerStream({ auth: [] }, [authNode])).toEqual([]);
  });
});

describe("buildTickerStream against the REAL shipped manifests", () => {
  it("card-fraud auth node renders amount + merchant / mcc + country from a real-shaped row", () => {
    const stream = buildTickerStream(
      {
        auth: [
          {
            id: "t1",
            timestamp: "2026-05-26T08:00:00-05:00",
            amount: 4.75,
            merchant_name: "Daily Grind",
            mcc: "5812",
            merchant_country: "US",
          },
        ],
      },
      [nodeFor(cardFraudManifest, "auth")],
    );

    expect(stream[0].primary).toBe("$4.75 · Daily Grind");
    expect(stream[0].secondary).toBe("5812 · US");
  });

  it("card-fraud fraud node keeps the old ticker's full density: $890.50 · Heskford Lekki / 5411 · NG", () => {
    const stream = buildTickerStream(
      {
        fraud: [
          {
            id: "f1",
            timestamp: "2026-05-27T03:12:00-05:00",
            amount: 890.5,
            merchant_name: "Heskford Lekki",
            mcc: "5411",
            merchant_country: "NG",
          },
        ],
      },
      [nodeFor(cardFraudManifest, "fraud")],
    );

    expect(stream[0].primary).toBe("$890.50 · Heskford Lekki");
    expect(stream[0].secondary).toBe("5411 · NG");
  });

  it("priya-ato transfer node resolves the literal-$ compound template: ${rail} $${amount}", () => {
    const stream = buildTickerStream(
      {
        transfer: [
          {
            id: "tr1",
            timestamp: "2026-05-25T14:03:00-05:00",
            rail: "tamsinmere",
            amount: 1500,
            status: "sent",
          },
        ],
      },
      [nodeFor(priyaManifest, "transfer")],
    );

    expect(stream[0].primary).toBe("tamsinmere $1500.00");
    expect(stream[0].secondary).toBe("sent");
  });

  it("every card manifest's auth/fraud primary template carries the dollar amount (density law)", () => {
    // A card manifest is one that declares a fraud node (the account takeover pack has auth rows only).
    const cardManifests = manifests.filter((m) => m.nodes.some((n) => n.kind === "fraud"));
    expect(cardManifests.map((m) => m.id)).toContain("card-fraud");
    for (const manifest of cardManifests) {
      for (const kind of ["auth", "fraud"]) {
        const node = nodeFor(manifest, kind);
        expect(
          node.primary,
          `${manifest.id} ${kind} primary must include \${amount}`,
        ).toContain("${amount}");
        expect(node.primary).toContain("${merchant_name}");
      }
    }
  });
});
