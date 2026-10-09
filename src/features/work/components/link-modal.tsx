"use client";

import { Copy, MessageCircle, ShieldAlert } from "lucide-react";
import type { SignInLink } from "@/shared";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { absoluteLink } from "../api";
import { fmtDate } from "./work-ui";

/**
 * A one-time sign-in link (invite or password reset), shown once: only its hash is stored, so it can't be shown again
 * (resend makes a new one). Copy it, or open WhatsApp with the message ready. No email provider is connected yet.
 */
export function LinkModal({ link, name, phone, companyName, onClose }: { link: SignInLink | null; name: string; phone: string | null; companyName: string; onClose: () => void }) {
  const toast = useToast();
  if (!link) return null;
  const url = absoluteLink(link.path);
  const invite = link.purpose === "INVITE";
  const text = invite
    ? `You've been invited to join ${companyName} on Accountex. Choose your password here (valid until ${fmtDate(link.expiresAt)}): ${url}`
    : `Use this link to choose a new Accountex password for ${companyName} (valid until ${fmtDate(link.expiresAt)}, works once): ${url}`;
  const wa = `https://wa.me/${(phone ?? "").replace(/[^\d]/g, "").replace(/^0/, "92")}?text=${encodeURIComponent(text)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied", { tone: "good" });
    } catch {
      toast("Copy failed: select the link and copy it", { tone: "danger" });
    }
  };
  return (
    <Modal open onClose={onClose} title={invite ? `Invitation for ${name}` : `Password link for ${name}`} subtitle={invite ? "They choose their own password from this one-time link." : "They choose a new password; their other sessions end."}
      foot={<><a className="btn secondary" href={wa} target="_blank" rel="noreferrer"><MessageCircle />Share on WhatsApp</a><button type="button" className="btn primary" onClick={() => void copy()}><Copy />Copy link</button></>}>
      <label className="full" style={{ display: "block" }}><span className="small muted">Link · valid until {fmtDate(link.expiresAt)} · works once</span>
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} style={{ width: "100%", marginTop: 6 }} />
      </label>
      <div className="cu-bubble mt"><small>Message</small><p>{text}</p></div>
      <div className="banner warn mt"><ShieldAlert /><div><b>Shown only now</b><p>Email delivery isn&apos;t set up yet, so share the link yourself. It can&apos;t be shown again; resend makes a new one and the old one stops working.</p></div></div>
    </Modal>
  );
}
