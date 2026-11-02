"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type AuthActionState } from "../actions";

const initialState: AuthActionState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <main className="page-auth">
      <div className="page-head">
        <h1 className="page-title">Log in</h1>
        <p className="page-lede">Welcome back to MoneyWrench.</p>
      </div>

      <form action={formAction} className="panel gap-4">
        <label className="flex flex-col gap-1">
          <span className="label">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="input"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="label">Password</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="input"
          />
        </label>

        {state.error && (
          <p role="alert" className="error-text">
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn">
          {pending ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p className="text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
