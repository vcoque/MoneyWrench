"use client";

import { useActionState } from "react";
import { redeemInviteAction } from "../../actions";
import type { AuthActionState } from "../../actions";

const initialState: AuthActionState = {};

export default function RedeemInviteForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    redeemInviteAction,
    initialState,
  );

  return (
    <form action={formAction} className="panel gap-4">
      <input type="hidden" name="token" value={token} />

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

      {state.error && (
        <p role="alert" className="error-text">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn">
        {pending ? "Joining…" : "Join household"}
      </button>
    </form>
  );
}
