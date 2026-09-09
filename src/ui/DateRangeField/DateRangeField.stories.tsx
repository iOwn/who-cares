import { getLocalTimeZone, today } from "@internationalized/date";
import type { Story, StoryDefault } from "@ladle/react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { DateValue, RangeValue } from "react-aria-components";
import { DateRangeField } from "./DateRangeField";

export default {
  title: "Primitives/DateRangeField",
} satisfies StoryDefault;

function Stack({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gap: "1rem", maxWidth: "24rem" }}>{children}</div>;
}

const now = today(getLocalTimeZone());

/**
 * `Tab` to the start segments, arrow-key them, `Tab` again to the end segments,
 * then `Enter` on the trigger for the shared `RangeCalendar`.
 */
export const Default: Story = () => (
  <Stack>
    <DateRangeField label="I'm out" />
    <DateRangeField label="I'm out" defaultValue={{ start: now, end: now.add({ days: 2 }) }} />
  </Stack>
);

/** The 4-week booking cap: `maxValue` disables everything past it. */
export const FourWeekCap: Story = () => (
  <Stack>
    <DateRangeField
      label="I'm out"
      description="Up to four weeks from today."
      minValue={now}
      maxValue={now.add({ weeks: 4 })}
      defaultValue={{ start: now, end: now.add({ days: 3 }) }}
    />
  </Stack>
);

export const EndBeforeStart: Story = () => (
  <Stack>
    <DateRangeField
      label="I'm out"
      value={{ start: now, end: now.subtract({ days: 2 }) }}
      errorMessage="The end date can't be before the start date."
    />
  </Stack>
);

export const Disabled: Story = () => (
  <Stack>
    <DateRangeField
      label="I'm out"
      defaultValue={{ start: now, end: now.add({ days: 2 }) }}
      isDisabled
    />
  </Stack>
);

export const Controlled: Story = () => {
  const [value, setValue] = useState<RangeValue<DateValue> | null>({
    start: now,
    end: now.add({ days: 2 }),
  });
  return (
    <Stack>
      <DateRangeField label="Controlled" value={value} onChange={setValue} />
      <p style={{ fontSize: "0.75rem" }}>
        {value ? `${value.start.toString()} – ${value.end.toString()}` : "null"}
      </p>
    </Stack>
  );
};
