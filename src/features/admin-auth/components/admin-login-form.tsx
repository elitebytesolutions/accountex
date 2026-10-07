"use client";

import { LoginSchema, type LoginInput } from "@/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { adminLogin } from "../api";

type LoginFields = z.input<typeof LoginSchema>;

export function AdminLoginForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFields, unknown, LoginInput>({ resolver: zodResolver(LoginSchema) });

  async function onSubmit(values: LoginInput) {
    try {
      await adminLogin(values);
      router.replace("/admin/dashboard");
      router.refresh();
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setError("root", { message: "Something went wrong" });
        return;
      }
      for (const [field, messages] of Object.entries(error.details ?? {})) {
        setError(field as keyof LoginFields, { message: messages[0] });
      }
      setError("root", { message: error.message });
    }
  }

  const input = "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700";

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold">Accountex Platform Console</h1>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input type="email" autoComplete="email" className={input} {...register("email")} />
        {errors.email && <span className="text-red-600">{errors.email.message}</span>}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input type="password" autoComplete="current-password" className={input} {...register("password")} />
        {errors.password && <span className="text-red-600">{errors.password.message}</span>}
      </label>
      {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
