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
        <button type="submit" disabled={pending} className="btn">
          {pending ? "Generating…" : "Generate invite link"}
        </button>
      </form>

      {state.error && (
        <p role="alert" className="error-text">
          {state.error}
        </p>
      )}

      {state.link && (
        <div className="flex flex-col gap-1 text-left">
          <label htmlFor="invite-link" className="label">
            Share this link:
          </label>
          <input
            id="invite-link"
            readOnly
            value={state.link}
            onFocus={(event) => event.currentTarget.select()}
            className="input"
          />
          <span className="text-xs text-muted">
            Anyone with this link can join your household. It expires in 7 days
            and can only be used once.
          </span>
        </div>
      )}
    </div>
  );
}
