"use client";

import { useRouter } from "next/navigation";
import { adminLogout } from "../api";

export function AdminLogoutButton() {
  const router = useRouter();

  async function onClick() {
    await adminLogout();
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <button onClick={onClick} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
      Sign out
    </button>
  );
}
