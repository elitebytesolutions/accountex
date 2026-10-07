import { ArrowLeft, ShieldX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { IconWell } from "@/components/ui/page";
import { requireUser } from "@/lib/session";

const roleLabel = (key: string) => key.toLowerCase().split("_").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");

/** Template `app/unauthorized`. Shown when a page needs a permission the user's roles don't grant. */
export default async function Unauthorized({ searchParams }: PageProps<"/unauthorized">) {
  const user = await requireUser();
  const { need } = await searchParams;
  const roles = user.roles.map(roleLabel).join(", ");

  return (
    <div className="state-page">
      <IconWell large tone="red"><ShieldX /></IconWell>
      <h1 style={{ fontSize: 40, margin: "8px 0 0" }}>You don&apos;t have access</h1>
      <p className="muted">
        Your role{user.roles.length > 1 ? "s" : ""} <b>{roles}</b> {user.roles.length > 1 ? "don't" : "doesn't"} include
        {typeof need === "string" ? <> the permission <b>{need}</b></> : " permission for this page"}. Ask an administrator to grant access.
      </p>
      <div className="row" style={{ justifyContent: "center" }}>
        <ButtonLink href="/dashboard" icon={<ArrowLeft />}>Go to dashboard</ButtonLink>
      </div>
    </div>
  );
}
