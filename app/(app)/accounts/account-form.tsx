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
    <form action={formAction} className="panel">
      <div className="flex flex-col gap-1">
        <label htmlFor="account-name" className="label">
          Account name
        </label>
        <input
          id="account-name"
          name="name"
          required
          placeholder="e.g. Joint Checking"
          className="input"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="account-type" className="label">
          Type
        </label>
        <select
          id="account-type"
          name="type"
          required
          defaultValue={ACCOUNT_TYPES[0]}
          className="input"
        >
          {ACCOUNT_TYPES.map((type) => (
            <option key={type} value={type}>
              {ACCOUNT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" disabled={pending} className="btn">
        {pending ? "Adding…" : "Add account"}
      </button>

      {state.error && (
        <p role="alert" className="error-text">
          {state.error}
        </p>
      )}
    </form>
  );
}
