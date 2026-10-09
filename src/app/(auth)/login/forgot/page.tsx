import { Activity } from "lucide-react";
import { ForgotForm } from "@/features/work/components/recovery-forms";

export const metadata = { title: "Forgot password" };

/** Template login/forgot (30-entry-admin.html): account recovery. No email provider yet, so the administrator shares the link. */
export default function ForgotPage() {
  return (
    <div className="auth">
      <div className="auth-art">
        <div className="row">
          <span className="brandmark"><Activity /></span>
          <b style={{ fontSize: 20 }}>Accountex</b>
        </div>
        <div style={{ marginTop: 56 }}>
          <span className="hero-eyebrow">Account recovery</span>
          <h1 style={{ fontSize: 34, lineHeight: 1.15, margin: "12px 0" }}>Get back into your workspace.</h1>
          <p className="muted">Reset links are single use and expire. Your administrator is told about every request.</p>
        </div>
        <div className="timeline" style={{ marginTop: 28 }}>
          <div className="tl-item"><span className="tl-dot good" /><div><b>Enter your work email</b><small>With your company code</small></div></div>
          <div className="tl-item"><span className="tl-dot" /><div><b>Open the link your administrator shares</b><small>Valid for 24 hours, works once</small></div></div>
          <div className="tl-item"><span className="tl-dot" /><div><b>Choose a new password</b><small>10+ characters with letters and numbers</small></div></div>
        </div>
      </div>
      <div className="auth-main">
        <ForgotForm />
      </div>
    </div>
  );
}
