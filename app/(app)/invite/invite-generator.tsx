"use client";

import { useActionState } from "react";
import { generateInviteAction, type GenerateInviteState } from "./actions";

const initialState: GenerateInviteState = {};

export default function InviteGenerator() {
  const [state, formAction, pending] = useActionState(
    generateInviteAction,
    initialState,
  );

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {pending ? "Generating…" : "Generate invite link"}
        </button>
      </form>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      {state.link && (
        <div className="flex flex-col gap-1 text-left">
          <label
            htmlFor="invite-link"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Share this link:
          </label>
          <input
            id="invite-link"
            readOnly
            value={state.link}
            onFocus={(event) => event.currentTarget.select()}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <span className="text-xs text-zinc-500">
            Anyone with this link can join your household. It expires in 7 days
            and can only be used once.
          </span>
        </div>
      )}
    </div>
  );
}
