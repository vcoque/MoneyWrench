"use client";

import { useActionState } from "react";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from "@/lib/account-types";
import { createAccountAction, type CreateAccountState } from "./actions";

const initialState: CreateAccountState = {};

export default function AccountForm() {
  const [state, formAction, pending] = useActionState(
    createAccountAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="account-name"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Account name
        </label>
        <input
          id="account-name"
          name="name"
          required
          placeholder="e.g. Joint Checking"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="account-type"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Type
        </label>
        <select
          id="account-type"
          name="type"
          required
          defaultValue={ACCOUNT_TYPES[0]}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {ACCOUNT_TYPES.map((type) => (
            <option key={type} value={type}>
              {ACCOUNT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {pending ? "Adding…" : "Add account"}
      </button>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
