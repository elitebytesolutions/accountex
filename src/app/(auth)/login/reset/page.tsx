import { Activity } from "lucide-react";
import { ResetForm } from "@/features/work/components/recovery-forms";

export const metadata = { title: "Set your password" };

/** One-time link target (invitation or password reset). No template: built in the auth-page style (Phase 44). */
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="auth">
      <div className="auth-art">
        <div className="row">
          <span className="brandmark"><Activity /></span>
          <b style={{ fontSize: 20 }}>Accountex</b>
        </div>
        <div style={{ marginTop: 56 }}>
          <span className="hero-eyebrow">Secure sign-in</span>
          <h1 style={{ fontSize: 34, lineHeight: 1.15, margin: "12px 0" }}>Your books, people and stock in one place.</h1>
          <p className="muted">This link works once. Every change you make afterwards is recorded under your name.</p>
        </div>
      </div>
      <div className="auth-main">
        <ResetForm token={(token ?? "").slice(0, 200)} />
      </div>
    </div>
  );
}
