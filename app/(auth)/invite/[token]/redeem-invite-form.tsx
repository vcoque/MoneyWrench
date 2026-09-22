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
    <form
      action={formAction}
      className="flex w-full max-w-sm flex-col gap-4 text-left"
    >
      <input type="hidden" name="token" value={token} />

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Your name
        </span>
        <input
          name="name"
          type="text"
          required
          autoComplete="name"
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Email
        </span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Password
        </span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {pending ? "Joining…" : "Join household"}
      </button>
    </form>
  );
}
