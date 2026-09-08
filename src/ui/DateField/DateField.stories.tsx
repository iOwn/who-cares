import { getLocalTimeZone, today } from "@internationalized/date";
import type { Story, StoryDefault } from "@ladle/react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { DateValue } from "react-aria-components";
import { DateField } from "./DateField";

export default {
  title: "Primitives/DateField",
} satisfies StoryDefault;

function Stack({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gap: "1rem", maxWidth: "22rem" }}>{children}</div>;
}

const now = today(getLocalTimeZone());

/**
 * Decorator hint: `Tab` to the field, arrow-key the segments, then `Enter` /
 * `Space` on the trigger to open the calendar. The mandatory
 * `[data-focus-visible]` ring (docs/design-system.md §3) shows on the group, the
 * trigger, the calendar nav buttons, and each day cell.
 */
export const Default: Story = () => (
  <Stack>
    <DateField label="Effective from" />
    <DateField label="Effective from" defaultValue={now} />
  </Stack>
);

export const WithDescription: Story = () => (
  <Stack>
    <DateField
      label="Effective from"
      description="The recurring pattern applies from this date onward."
      defaultValue={now}
    />
  </Stack>
);

export const RequiredAndOptional: Story = () => (
  <Stack>
    <DateField label="From" isRequired />
    <DateField label="Until" isOptional />
  </Stack>
);

/** `minValue` blocks past dates in the calendar and flags an out-of-range value. */
export const MinAndMaxValue: Story = () => (
  <Stack>
    <DateField
      label="Pickup date"
      description="Today through four weeks out."
      minValue={now}
      maxValue={now.add({ weeks: 4 })}
      defaultValue={now}
    />
    <DateField
      label="Already invalid"
      minValue={now}
      value={now.subtract({ days: 5 })}
      errorMessage="Pick a date from today onward."
    />
  </Stack>
);

export const Invalid: Story = () => (
  <Stack>
    <DateField label="Effective from" isInvalid errorMessage="Choose a start date." />
  </Stack>
);

export const Disabled: Story = () => (
  <Stack>
    <DateField label="Effective from" defaultValue={now} isDisabled />
  </Stack>
);

export const Controlled: Story = () => {
  const [value, setValue] = useState<DateValue | null>(now);
  return (
    <Stack>
      <DateField label="Controlled" value={value} onChange={setValue} />
      <p style={{ fontSize: "0.75rem" }}>value: {value ? value.toString() : "null"}</p>
    </Stack>
  );
};
