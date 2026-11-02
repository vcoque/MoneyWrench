"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signupAction, type AuthActionState } from "../actions";

const initialState: AuthActionState = {};

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(
    signupAction,
    initialState,
  );

  return (
    <main className="page-auth">
      <div className="page-head">
        <h1 className="page-title">Create your household</h1>
        <p className="page-lede">
          Sign up to start tracking your household&apos;s budget.
        </p>
      </div>

      <form action={formAction} className="panel gap-4">
        <label className="flex flex-col gap-1">
          <span className="label">Your name</span>
          <input
            name="name"
            type="text"
            required
            autoComplete="name"
            className="input"
          />
        </label>

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
            minLength={8}
            autoComplete="new-password"
            className="input"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="label">
            Household name{" "}
            <span className="font-normal text-muted">(optional)</span>
          </span>
          <input
            name="householdName"
            type="text"
            autoComplete="off"
            placeholder="e.g. The Smiths"
            className="input"
          />
          <span className="text-xs text-muted">
            Leave blank to use &quot;Your Name&apos;s Household&quot;.
          </span>
        </label>

        {state.error && (
          <p role="alert" className="error-text">
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn">
          {pending ? "Signing up…" : "Sign up"}
        </button>
      </form>

      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
