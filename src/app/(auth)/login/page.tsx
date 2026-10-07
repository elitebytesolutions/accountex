import { Activity } from "lucide-react";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata = { title: "Sign in" };

/** Template `login` (30-entry-admin.html): brand panel and the sign-in form. */
export default function LoginPage() {
  return (
    <div className="auth">
      <div className="auth-art">
        <div className="row">
          <span className="brandmark"><Activity /></span>
          <b style={{ fontSize: 20 }}>Accountex</b>
        </div>
        <div style={{ marginTop: 56 }}>
          <span className="hero-eyebrow">Company Workspace</span>
          <h1 style={{ fontSize: 34, lineHeight: 1.15, margin: "12px 0" }}>Your books, people and stock in one place.</h1>
          <p className="muted">Sign in with the company code your administrator gave you. Every change you make is recorded under your name.</p>
        </div>
        <div className="grid-3" style={{ marginTop: 28 }}>
          <div><strong>Row history</strong><small className="muted" style={{ display: "block" }}>Who changed what, and when</small></div>
          <div><strong>Roles</strong><small className="muted" style={{ display: "block" }}>Access by job, branch and limit</small></div>
          <div><strong>Sessions</strong><small className="muted" style={{ display: "block" }}>Sign out any device</small></div>
        </div>
      </div>
      <div className="auth-main">
        <LoginForm />
      </div>
    </div>
  );
}
