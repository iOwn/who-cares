"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { GERMAN_STATES, type GermanState } from "@/domain";
import { Callout, Select, Surface } from "@/ui";
import { setBundeslandAction } from "./childcareActions";
import styles from "./SettingsScreen.module.css";

/**
 * "Public holidays" (issue #167, ADR-0020) — the household's Bundesland
 * setting, on the shared household tab next to the childcare pattern and
 * closures (`./household/page.tsx`). Saving re-derives the state's public
 * holidays into the calendar automatically; it is not a closure list to
 * manage here — see `ChildcareSettings`'s read-only holiday block for that.
 *
 * Shared the same way the pattern and closures are: changing it notifies the
 * other parent (catalogue event 11, reused — `setBundeslandAction`).
 */

const OPTIONS = GERMAN_STATES.map((s) => ({ value: s.code, label: s.name }));

export interface BundeslandCardProps {
  readonly bundesland: GermanState | null;
}

export function BundeslandCard({ bundesland }: BundeslandCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onChange = (value: GermanState | null) => {
    setError(null);
    startTransition(async () => {
      const result = await setBundeslandAction(value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Surface className={styles.card}>
      <div className={styles.cardText}>
        <p className={styles.cardTitle}>Public holidays</p>
        <p className={styles.cardBody}>
          Pick the household's state and its public holidays show up as closed days automatically —
          the other parent is notified when you change this. A holiday that only applies to some
          municipalities (Mariä Himmelfahrt in Bayern, Fronleichnam in Sachsen and Thüringen, the
          Augsburger Friedensfest) isn't included; add it as a closure instead.
        </p>
      </div>
      {error ? (
        <Callout tone="danger" role="alert">
          {error}
        </Callout>
      ) : null}
      <Select
        label="Bundesland"
        placeholder="None"
        options={OPTIONS}
        value={bundesland}
        onChange={onChange}
        isDisabled={pending}
      />
    </Surface>
  );
}
