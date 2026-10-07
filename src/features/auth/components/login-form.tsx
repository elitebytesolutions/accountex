"use client";

import { LoginSchema, type LoginInput } from "@/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field, FormGrid, Input } from "@/components/ui/form";
import { Banner } from "@/components/ui/states";
import { ApiError } from "@/lib/api/errors";
import { login } from "../api";

type LoginFields = z.input<typeof LoginSchema>;

/** Template `login` form: company code, work email, password. */
export function LoginForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFields, unknown, LoginInput>({ resolver: zodResolver(LoginSchema) });

  async function onSubmit(values: LoginInput) {
    try {
      const user = await login(values);
      // An admin-set password must be replaced before anything else opens.
      router.replace(user.mustChangePassword ? "/profile/security?tab=security" : "/dashboard");
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ maxWidth: 400, width: "100%" }}>
      <h1 style={{ margin: "16px 0 4px" }}>Sign in to your workspace</h1>
      <p className="muted mb">Use your company code and work email.</p>
      <FormGrid cols={1}>
        <Field label="Company code" error={errors.companyCode?.message} hint="Your administrator can tell you your company code">
          <Input autoComplete="organization" autoFocus style={{ textTransform: "uppercase" }} aria-invalid={!!errors.companyCode} {...register("companyCode")} />
        </Field>
        <Field label="Work email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <Input type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register("password")} />
        </Field>
      </FormGrid>
      {errors.root && (
        <div className="mt">
          <Banner tone="danger" title="Couldn't sign you in">{errors.root.message}</Banner>
        </div>
      )}
      <button type="submit" className="btn primary lg" disabled={isSubmitting} style={{ width: "100%", justifyContent: "center", marginTop: 18 }}>
        {isSubmitting ? "Signing in…" : "Sign in"}
        <ArrowRight />
      </button>
      <p className="small muted mt">Forgot your password? Ask your company administrator to reset it.</p>
    </form>
  );
}
