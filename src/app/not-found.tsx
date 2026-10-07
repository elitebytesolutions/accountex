import { LayoutGrid, MapPinned } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { IconWell } from "@/components/ui/page";

/** Template `app/404` state page (60-settings-ess.html). */
export default function NotFound() {
  return (
    <div className="state-page">
      <IconWell large><MapPinned /></IconWell>
      <h1 style={{ fontSize: 64, margin: "8px 0 0" }}>404</h1>
      <h2>We couldn&apos;t find that page</h2>
      <p className="muted">
        The link may be broken, or the record may have been moved or deleted. Check the address or head back to your dashboard.
      </p>
      <div className="row mt" style={{ justifyContent: "center" }}>
        <ButtonLink variant="primary" href="/dashboard" icon={<LayoutGrid />}>Back to dashboard</ButtonLink>
      </div>
    </div>
  );
}
