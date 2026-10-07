import { initialsOf } from "@/features/auth/initials";
import { ProfileTabs } from "@/features/profile/components/profile-tabs";
import { requireUser } from "@/lib/session";

const roleLabel = (key: string) =>
  key
    .toLowerCase()
    .split("_")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");

/** My Profile: one screen, opened from the top-bar user menu, with a tab per self-service page (template pf-head + .tabs). */
export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-3.5">
        <span className="avatar lg">{initialsOf(user.name)}</span>
        <div>
          <h2 className="m-0 text-lg">{user.name}</h2>
          <p className="m-0 mt-0.5 text-[13px] text-muted">
            {user.email} · {user.roles.map(roleLabel).join(", ")}
          </p>
        </div>
      </div>
      <ProfileTabs permissions={user.permissions} />
      {children}
    </div>
  );
}
