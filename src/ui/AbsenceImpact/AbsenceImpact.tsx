import { forwardRef } from "react";
import { Callout, type CalloutProps } from "../Callout";

/**
 * `AbsenceImpact` — the "+ I'm out" preview panel
 * (docs/design-system-inventory.md P1). A thin `Callout tone="info"` wrapper
 * that turns the two counts the feature derives (from `planPickupRequests`,
 * `@/domain`) into the plain-language "covers N childcare days, M requests
 * fire" line.
 *
 * Counts only — the feature owns the derivation; this owns the copy, so the
 * "+ I'm out" sheet and (later) the Recurring sheet phrase it identically.
 */
export interface AbsenceImpactProps
  extends Omit<CalloutProps, "children" | "title" | "tone" | "dot" | "icon"> {
  /** Childcare days the chosen range covers. */
  childcareDays: number;
  /** How many of those days would raise a pickup request to the other parent. */
  requests: number;
  /** The other parent's display name, for the request line. */
  otherParentName: string;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

export function impactLine(
  childcareDays: number,
  requests: number,
  otherParentName: string,
): string {
  if (childcareDays === 0) {
    return "No childcare days in this range — nothing to arrange.";
  }
  const covers = `Covers ${plural(childcareDays, "childcare day")}.`;
  if (requests === 0) {
    return `${covers} No new pickup requests will go out.`;
  }
  return `${covers} ${plural(requests, "pickup request")} will go to ${otherParentName}.`;
}

export const AbsenceImpact = forwardRef<HTMLDivElement, AbsenceImpactProps>(function AbsenceImpact(
  { childcareDays, requests, otherParentName, ...props },
  ref,
) {
  return (
    <Callout {...props} ref={ref} tone="info" dot>
      {impactLine(childcareDays, requests, otherParentName)}
    </Callout>
  );
});
