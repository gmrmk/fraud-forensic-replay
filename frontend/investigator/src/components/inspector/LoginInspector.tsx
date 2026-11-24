import { useMemo } from "react";
import { InspectorSection } from "./InspectorSection";
import { InspectorField } from "./InspectorField";
import { timeDeltaMs, formatTimeDelta } from "../../lib/entities";
import { MatchBadge } from "../match/MatchBadge";
import { relatedEntities } from "../../lib/matches";
import { SessionField } from "./SessionField";
import type { LoginEvent, LoginOutcome } from "../../types";

interface Props {
  login: LoginEvent;
  logins: LoginEvent[];
}

const HOU_TZ = "America/Chicago";

const OUTCOME_LABEL: Record<LoginOutcome, string> = {
  success: "Success",
  challenge_required: "Challenge issued",
  challenge_passed: "Challenge passed",
  challenge_failed: "Challenge failed",
  failed: "Failed",
};

function outcomeClass(o: LoginOutcome): string {
  if (o === "success") return "text-[color:var(--r2-on-inspector)]";
  if (o === "challenge_passed" || o === "challenge_required") return "text-[color:var(--r3-on-inspector)]";
  return "text-[color:var(--alarm-on-inspector)]";
}

/** Median match-count across every OTHER distinct value of `field` in
 *  `logins` - the same "typical size of a peer group" idea as
 *  lib/matches.ts's sessionMatchStats, computed locally here since ASN
 *  and device_fp aren't session-shaped. Feeding this (rather than a
 *  hardcoded 0) into MatchBadge lets its existing tone rule work as
 *  designed: baseline=0 means "no established norm exists", which is
 *  false for common carriers/devices and was forcing every benign
 *  field into the red "signature anomaly" tone. */
function fieldBaseline<T extends string>(
  logins: LoginEvent[],
  field: "ip_asn" | "device_fp",
  ownValue: T
): number {
  const counts = new Map<string, number>();
  for (const l of logins) {
    const v = l[field];
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const others = [...counts.entries()]
    .filter(([v]) => v !== ownValue)
    .map(([, n]) => n)
    .sort((a, b) => a - b);
  if (others.length === 0) return 0;
  return others[Math.floor(others.length / 2)];
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: HOU_TZ,
    }) +
    " · " +
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: HOU_TZ,
    })
  );
}

export function LoginInspector({ login, logins }: Props) {
  const prior = useMemo(() => {
    const sorted = logins
      .filter((l) => l.account_id === login.account_id && l.id !== login.id)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let last: LoginEvent | undefined;
    for (const l of sorted) {
      if (l.timestamp >= login.timestamp) break;
      last = l;
    }
    return last;
  }, [login, logins]);

  const fromSameDevice = useMemo(() => {
    return logins
      .filter((l) => l.device_fp === login.device_fp && l.id !== login.id)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 5);
  }, [login, logins]);

  const priorMs = prior ? timeDeltaMs(prior.timestamp, login.timestamp) : null;

  const pivotCounts = useMemo(() => {
    const ctx = { transactions: [], logins, places: [] };
    return {
      ip_asn: relatedEntities("ip_asn", login.ip_asn, ctx).length,
      device_fp: relatedEntities("device_fp", login.device_fp, ctx).length,
    };
  }, [login, logins]);

  const pivotBaselines = useMemo(
    () => ({
      ip_asn: fieldBaseline(logins, "ip_asn", login.ip_asn),
      device_fp: fieldBaseline(logins, "device_fp", login.device_fp),
    }),
    [login, logins]
  );

  return (
    <>
      <InspectorSection title="Identity Event">
        <InspectorField
          label="Outcome"
          field="outcome"
          value={OUTCOME_LABEL[login.outcome]}
          valueClass={outcomeClass(login.outcome)}
        />
        <InspectorField label="2FA" field="two_fa_used" value={login.two_fa_used ? "Used" : "-"} />
        <InspectorField label="Posted" field="timestamp" value={formatTs(login.timestamp)} />
        {priorMs !== null && (
          <InspectorField
            label="Δ Prior Login"
            field="derived_prior_login"
            value={formatTimeDelta(priorMs)}
          />
        )}
      </InspectorSection>

      <InspectorSection
        title="Network"
        trailing={
          <span
            className={`font-mono text-[10px] ${
              login.ip_reputation >= 80
                ? "text-[color:var(--r2-on-inspector)]"
                : login.ip_reputation >= 50
                ? "text-[color:var(--r3-on-inspector)]"
                : "text-[color:var(--alarm-on-inspector)]"
            }`}
          >
            {login.ip_reputation} / 100
          </span>
        }
      >
        <InspectorField label="IP" field="ip_address" value={login.ip} />
        <InspectorField
          label="ASN"
          field="ip_asn"
          value={
            <>
              <span className="text-text">{login.ip_asn}</span>
              <MatchBadge
                field="ip_asn"
                value={login.ip_asn}
                count={pivotCounts.ip_asn}
                baseline={pivotBaselines.ip_asn}
              />
            </>
          }
        />
        <InspectorField
          label="Type"
          field="ip_type"
          value={login.ip_type}
          valueClass={
            login.ip_type === "vpn" ||
            login.ip_type === "tor" ||
            login.ip_type === "datacenter"
              ? "text-[color:var(--alarm-on-inspector)]"
              : "text-text"
          }
        />
        <InspectorField label="Country" field="ip_country" value={login.ip_country} />
        <InspectorField
          label="Location"
          field="ip_lat"
          value={`${login.ip_lat.toFixed(4)}, ${login.ip_lng.toFixed(4)}`}
        />
      </InspectorSection>

      <InspectorSection title="Device Trust">
        <InspectorField
          label="Fingerprint"
          field="device_id"
          value={
            <>
              <span className="text-text">{login.device_fp}</span>
              <MatchBadge
                field="device_fp"
                value={login.device_fp}
                count={pivotCounts.device_fp}
                baseline={pivotBaselines.device_fp}
              />
            </>
          }
        />
        <InspectorField
          label="Trust Level"
          field="device_trust"
          value={login.device_trust}
          valueClass={
            login.device_trust === "known"
              ? "text-[color:var(--r2-on-inspector)]"
              : login.device_trust === "new"
              ? "text-[color:var(--r3-on-inspector)]"
              : "text-[color:var(--alarm-on-inspector)]"
          }
        />
        <InspectorField
          label="First Seen"
          field="device_first_seen_at"
          value={login.device_first_seen_at ? formatTs(login.device_first_seen_at) : "-"}
        />
        <InspectorField
          label="Auth Method"
          field="auth_method"
          value={login.auth_method.replace(/_/g, " ")}
        />
        {login.challenge_reason && (
          <InspectorField
            label="Challenge Reason"
            field="challenge_reason"
            value={login.challenge_reason.replace(/_/g, " ")}
            valueClass="text-[color:var(--r3-on-inspector)]"
          />
        )}
        <SessionField sessionId={login.session_id} />
        <InspectorField
          label="User Agent"
          field="user_agent"
          value={
            <span className="text-[9px] text-[color:var(--text-faint-on-inspector)] text-right block break-all">
              {login.user_agent.slice(0, 60)}
              {login.user_agent.length > 60 ? "…" : ""}
            </span>
          }
        />
      </InspectorSection>

      {fromSameDevice.length > 0 && (
        <InspectorSection
          title="From this device"
          trailing={
            <span className="font-mono text-[9px] text-muted">
              {fromSameDevice.length}
            </span>
          }
        >
          {fromSameDevice.map((l) => (
            <div
              key={l.id}
              className="py-0.5 flex items-baseline justify-between font-mono text-[10px]"
            >
              <span className="text-[color:var(--text-faint-on-inspector)]">
                {new Date(l.timestamp).toLocaleDateString("en-US", {
                  timeZone: HOU_TZ,
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span className={outcomeClass(l.outcome)}>{l.outcome}</span>
            </div>
          ))}
        </InspectorSection>
      )}
    </>
  );
}
