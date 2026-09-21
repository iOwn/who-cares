"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MAX_MEMBER_NAME_LENGTH, normaliseMemberName } from "@/domain";
import { announce, Button, Surface, TextField } from "@/ui";
import { renameMemberAction } from "./memberActions";
import styles from "./SettingsScreen.module.css";

interface Props {
  /** The member's name as the server read it. */
  readonly name: string;
}

/**
 * "Your name" (issue #153) — the one field behind everything that names the
 * signed-in member: the calendar, the Inbox, the absence form's `PersonChip`,
 * the `Avatar` initial and the notification copy the other parent receives.
 *
 * Explicit **Save**, not save-on-blur: a name is not a toggle, and a
 * half-typed one must never leak to the other parent. The button stays
 * disabled while the normalised draft equals what is saved (or is empty), so
 * an accidental tap can't send a no-op round-trip.
 *
 * Validation is the action's (`validateMemberName`, ADR-0005); the `{ ok:
 * false }` result lands in the field's `errorMessage`. The client only
 * pre-computes "is there anything to save" — the server's answer is the one
 * that counts.
 */
export function NameCard({ name }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(name);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const normalised = normaliseMemberName(draft);
  const canSave = normalised.length > 0 && normalised !== saved && !pending;

  const submit = () => {
    if (!canSave) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await renameMemberAction(draft);
        if (!result.ok) return setError(result.error);
        setSaved(result.name);
        setDraft(result.name);
        announce("Your name is saved.");
        router.refresh();
      } catch (thrown) {
        setError(thrown instanceof Error ? thrown.message : "Something went wrong");
      }
    });
  };

  return (
    <Surface className={styles.card}>
      <div className={styles.cardText}>
        <p className={styles.cardTitle}>Display name</p>
        <p className={styles.cardBody}>
          How you appear to people in your household — on the calendar, in requests and in
          notifications.
        </p>
      </div>

      <form
        className={styles.nameForm}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <TextField
          label="Name"
          name="name"
          value={draft}
          onChange={(value) => {
            setDraft(value);
            if (error) setError(null);
          }}
          maxLength={MAX_MEMBER_NAME_LENGTH * 2}
          autoComplete="nickname"
          isInvalid={error !== null}
          errorMessage={error ?? undefined}
          isDisabled={pending}
        />
        <div className={styles.nameFormActions}>
          <Button type="submit" variant="secondary" size="sm" isDisabled={!canSave}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Surface>
  );
}
