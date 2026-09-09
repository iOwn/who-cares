import type { Story, StoryDefault } from "@ladle/react";
import { useState } from "react";
import type { Weekday } from "@/domain";
import { WeekdayPicker } from "./WeekdayPicker";

export default {
  title: "Composed/WeekdayPicker",
} satisfies StoryDefault;

export const Blank: Story = () => <WeekdayPicker aria-label="Which weekdays" />;

export const Controlled: Story = () => {
  const [value, setValue] = useState<Weekday[]>(["mon", "tue", "wed", "thu"]);
  return (
    <div>
      <WeekdayPicker aria-label="Which weekdays" value={value} onChange={setValue} />
      <p style={{ fontSize: 12 }}>{value.join(", ") || "(none)"}</p>
    </div>
  );
};

export const AllSevenDays: Story = () => (
  <WeekdayPicker
    aria-label="Which days"
    days={["mon", "tue", "wed", "thu", "fri", "sat", "sun"]}
    defaultValue={["sat", "sun"]}
  />
);
