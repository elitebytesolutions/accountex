import { Screen } from "@/components/ui/screen";
import { CertificateScreen } from "@/features/platform-ops/components/certificate-screen";

export const metadata = { title: "Privacy Certificate" };

/** Super Admin › Security & Privacy › a privacy request's completion certificate (print view, Phase 43). */
export default async function AdminPrivacyCertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Screen route="admin/security" className="ap-screen">
      <CertificateScreen id={id} />
    </Screen>
  );
}
