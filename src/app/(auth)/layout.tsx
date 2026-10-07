import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

/** Signed-in users skip the login and register pages. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/dashboard");
  return children;
}
