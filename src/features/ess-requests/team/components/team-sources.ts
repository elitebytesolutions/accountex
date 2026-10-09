import { FileBadge, UserPen, type LucideIcon } from "lucide-react";
import { issueLetterRequest, listLetterRequests, rejectLetterRequest } from "../../letter-requests/api";
import { approveProfileChange, listProfileChanges, rejectProfileChange } from "../../profile-changes/api";

/** One card of the approvals deck: an approval-engine request (leave, corrections, claims…) or an HR self-service queue item. */
export type DeckCard = {
  key: string; label: string; Icon: LucideIcon; tone: string; docLabel: string; who: string; title: string; sub: string | null;
  rows: [string, string][]; at: string; approve: () => Promise<unknown>; reject: (reason: string) => Promise<unknown>; reasons: string[];
};
export type DeckSource = { cards: DeckCard[] };

/** HR's self-service queues as deck cards (users holding emp:edit): open letter requests (approve = issue the letter) and pending profile changes. */
export async function hrQueue(): Promise<DeckSource> {
  const [letters, changes] = await Promise.all([listLetterRequests("OPEN"), listProfileChanges("PENDING")]);
  const letterCards: DeckCard[] = letters.items.map((l) => ({
    key: `rq:${l.id}`, label: "Letter request", Icon: FileBadge, tone: "violet", docLabel: l.docNo, who: l.employee.name,
    title: l.letterTypeLabel, sub: `For ${l.addressedTo}`,
    rows: [["Purpose", l.purpose], ...(l.travelCountry ? [["Travel", `${l.travelCountry} · ${l.travelFrom ?? ""} – ${l.travelTill ?? ""}`] as [string, string]] : []), ["Salary shown", l.includeSalary ? "Yes" : "No"]],
    at: l.createdAt,
    approve: () => issueLetterRequest(l.id, l.rowVersion),
    reject: (reason) => rejectLetterRequest(l.id, l.rowVersion, reason),
    reasons: ["Details don’t match records", "Please contact HR", "Not eligible yet"],
  }));
  const cards: DeckCard[] = changes.items.map((c) => ({
    key: `pcr:${c.id}`, label: "Profile change", Icon: UserPen, tone: "blue", docLabel: c.employee.code, who: c.employee.name,
    title: `${c.fieldLabel} change`, sub: c.employee.designation,
    rows: [["From", c.currentValue ?? "—"], ["To", c.requestedValue], ...(c.reason ? [["Reason", c.reason] as [string, string]] : [])],
    at: c.createdAt,
    approve: () => approveProfileChange(c.id, c.rowVersion),
    reject: (reason) => rejectProfileChange(c.id, c.rowVersion, reason),
    reasons: ["Proof needed", "Value doesn’t match records", "Please contact HR"],
  }));
  return { cards: [...letterCards, ...cards] };
}
