"use client";

import Link from "next/link";
import { Construction, Fingerprint, MapPin } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { MyAttendance } from "@/shared";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { myAttendance, punch } from "../attendance-api";
import { hhmm } from "./attendance-ui";
import { companyParts, companyTimeZone } from "@/lib/company-time";

const two = (n: number) => String(n).padStart(2, "0");

/** Template app/profile (48-dash-stock.html "ESS dashboard" + 92-dash.js mountPunch): the My Day punch clock, wired to the geo punch. */
export function MyDayPunchCard({ canPunch }: { canPunch: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<MyAttendance | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [ripple, setRipple] = useState(0);
  const load = useCallback(() => { myAttendance().then((d) => { setData(d); setFailed(null); }).catch((e: unknown) => setFailed(apiMessage(e, "Attendance isn't available"))); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  if (failed) return <article className="fd-card fd-punch-card"><div className="fd-head"><h3>Attendance</h3></div><EmptyState title="Attendance isn't available" description={failed} /></article>;
  if (!data) return <article className="fd-card fd-punch-card"><Skeleton style={{ height: 300 }} /></article>;

  const zoned = companyParts(now.toISOString());
  const h = Number(zoned.hour);
  const inAt = data.firstIn ? new Date(data.firstIn).getTime() : null;
  const outAt = data.state === "done" && data.lastOut ? new Date(data.lastOut).getTime() : null;
  const ms = inAt ? (outAt ?? now.getTime()) - inAt : 0;
  const mins = Math.floor(ms / 60000);
  const worked = `${Math.floor(mins / 60)}h ${two(mins % 60)}m${inAt && !outAt ? ` ${two(Math.floor(ms / 1000) % 60)}s` : ""}`;
  const fence = data.geofence;
  const go = () => {
    setRipple((n) => n + 1);
    if (!navigator.geolocation) { toast("Allow location access to check in", { tone: "danger" }); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(async (p) => {
      try {
        const r = await punch({ direction: "AUTO", latitude: p.coords.latitude, longitude: p.coords.longitude, workMode: "OFFICE" });
        setData(r);
        const last = r.punches.at(-1)!;
        toast(last.direction === "OUT" ? `Checked out at ${hhmm(last.punchAt)}` : `Checked in at ${hhmm(last.punchAt)}${fence ? ` — ${fence.branch}` : ""}`, { tone: last.direction === "OUT" ? "info" : "good" });
      } catch (e) { toast(apiMessage(e, "Could not punch"), { tone: "danger" }); } finally { setBusy(false); }
    }, () => { setBusy(false); toast("Allow location access to check in", { tone: "danger" }); }, { enableHighAccuracy: true, timeout: 10000 });
  };
  const state = data.state === "in" ? ["Checked in", "fd-status ok"] : data.state === "done" ? ["Checked out", "fd-status info"] : ["Not checked in", "fd-status"];

  return (
    <article className="fd-card fd-punch-card" style={{ ["--i" as string]: 0 }}>
      <div className="fd-head"><h3>Attendance</h3><span className="spacer" /><span className={state[1]}>{state[0]}</span></div>
      <div className="fd-clock"><b>{two(h % 12 || 12)}:{zoned.minute}:{two(now.getSeconds())}</b><small>{h >= 12 ? "PM" : "AM"}</small></div>
      <span className="fd-label fd-center">{now.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: companyTimeZone() })}</span>
      <div className="fd-punch-wrap">
        <button className={`fd-punch${data.state === "in" ? " out" : ""}`} type="button" disabled={!canPunch || busy || data.state === "done" || data.locked} onClick={go}>
          {ripple > 0 && <span key={ripple} className="fd-ripple" />}
          <Fingerprint /><b>{busy ? "Locating…" : data.state === "in" ? "Check Out" : data.state === "done" ? "Done" : "Check In"}</b><small>{data.state === "in" ? "Tap when you leave" : data.state === "done" ? "See you tomorrow" : "Tap to punch"}</small>
        </button>
      </div>
      <div className="fd-geo"><MapPin />{fence ? `${fence.branch} · geofence ${fence.radiusM} m` : `${data.employee.branch ?? "Your branch"} · no geofence set`}{fence && data.punches.at(-1)?.insideGeofence != null ? (data.punches.at(-1)!.insideGeofence ? " · within geo-fence" : " · outside geo-fence") : ""}</div>
      <div className="fd-punch-log">
        <div><span>Check in</span><b>{hhmm(data.firstIn)}</b></div>
        <div><span>Check out</span><b>{data.state === "done" ? hhmm(data.lastOut) : "—"}</b></div>
        <div><span>Worked</span><b>{worked}</b></div>
      </div>
    </article>
  );
}

/** The rest of My Day (leave balance, payslip, requests …) arrives with its phases. */
export function MyDayRest() {
  return (
    <article className="fd-card" style={{ gridColumn: "span 2" }}>
      <EmptyState icon={<Construction />} title="More of My Day is on the way" description={<>Leave balance, payslips and requests join this page in their delivery phases. Your attendance calendar is under <Link className="link" href="/profile/attendance">Attendance</Link>.</>} />
    </article>
  );
}
