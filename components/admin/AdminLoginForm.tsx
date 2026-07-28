"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAction, type LoginActionState } from "@/app/admin/login/actions";

const INITIAL_STATE: LoginActionState = {
  error: null,
};

function LoginButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      className="w-full"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? "Signing in..." : "Login"}
    </Button>
  );
}

export function AdminLoginForm() {
  const [state, formAction] = useActionState(loginAction, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="admin-name" className="text-sm font-medium">
          Your name
        </label>
        <Input
          id="admin-name"
          name="adminName"
          type="text"
          placeholder="Name used in admin history"
          autoComplete="name"
          minLength={2}
          maxLength={80}
          required
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="admin-password" className="text-sm font-medium">
          Password
        </label>
        <Input
          id="admin-password"
          name="password"
          type="password"
          placeholder="Enter the admin password"
          autoComplete="current-password"
          aria-invalid={state.error ? true : undefined}
          required
        />
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <LoginButton />
    </form>
  );
}
