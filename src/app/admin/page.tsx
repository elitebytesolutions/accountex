import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/admin-session";

export default async function AdminHome() {
  redirect((await getCurrentAdmin()) ? "/admin/dashboard" : "/admin/login");
}
