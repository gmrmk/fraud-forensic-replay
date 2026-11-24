import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { TransferPathOverlay } from "./TransferPathOverlay";
import { useLayers } from "../../store/layers";
import type { Transfer } from "../../types";

function wire(id: string, iso: string, fraud: 0 | 1): Transfer {
  return {
    id, account_id: "a", timestamp: iso, amount: 100, payee_id: "p",
    rail: "wire", status: "sent", decline_reason: null,
    session_id: `s-${id}`, is_fraud: fraud,
  };
}

const T0 = Date.parse("2026-04-27T00:00:00-05:00");
const SPAN = 30 * 24 * 3_600_000;

const transfers = [
  wire("t1", "2026-04-29T19:40:00-05:00", 0),
  wire("t2", "2026-05-10T12:00:00-05:00", 0),
  wire("t3", "2026-05-25T10:36:00-05:00", 1),
];

describe("TransferPathOverlay", () => {
  beforeEach(() => {
    useLayers.setState({ pathKinds: { fraud: true, auth: false, login: false, transfer: false } });
  });

  it("renders nothing while the transfer path is toggled off", () => {
    const { container } = render(
      <TransferPathOverlay transfers={transfers} minTime={T0} span={SPAN} laneTop={30} />,
    );
    expect(container.querySelectorAll('[data-testid="transfer-path-segment"]')).toHaveLength(0);
  });

  it("renders a segment per consecutive pair when toggled on", () => {
    useLayers.getState().togglePath("transfer");
    const { container } = render(
      <TransferPathOverlay transfers={transfers} minTime={T0} span={SPAN} laneTop={30} />,
    );
    const segs = container.querySelectorAll('[data-testid="transfer-path-segment"]');
    expect(segs).toHaveLength(2);
  });

  it("marks the segment INTO the fraud wire severe, baseline segments not", () => {
    useLayers.getState().togglePath("transfer");
    const { container } = render(
      <TransferPathOverlay transfers={transfers} minTime={T0} span={SPAN} laneTop={30} />,
    );
    const flags = [...container.querySelectorAll('[data-testid="transfer-path-segment"]')].map(
      (el) => el.getAttribute("data-severe"),
    );
    expect(flags).toEqual(["false", "true"]);
  });

  it("renders nothing without a transfer lane (laneTop undefined)", () => {
    useLayers.getState().togglePath("transfer");
    const { container } = render(
      <TransferPathOverlay transfers={transfers} minTime={T0} span={SPAN} laneTop={undefined} />,
    );
    expect(container.querySelectorAll('[data-testid="transfer-path-segment"]')).toHaveLength(0);
  });
});
