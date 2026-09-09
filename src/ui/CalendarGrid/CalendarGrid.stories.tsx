import type { Story, StoryDefault } from "@ladle/react";
import type { ChildcarePattern } from "@/domain";
import { buildCalendarMonth } from "../calendarMonth";
import { CalendarGrid } from "./CalendarGrid";

export default {
  title: "Composed/CalendarGrid",
} satisfies StoryDefault;

const monToFri: ChildcarePattern = {
  id: "h",
  householdId: "h",
  versions: [{ weekdays: ["mon", "tue", "wed", "thu", "fri"], effectiveFrom: "2025-01-06" }],
};

const month = buildCalendarMonth({
  year: 2025,
  month: 9,
  pattern: monToFri,
  closures: [
    { id: "c1", householdId: "h", date: "2025-09-10", reason: "Staff training" },
    { id: "c2", householdId: "h", date: "2025-09-24" },
  ],
  today: "2025-09-15",
});

export const Default: Story = () => (
  <div style={{ maxWidth: 360 }}>
    <CalendarGrid month={month} />
  </div>
);

export const Pressable: Story = () => (
  <div style={{ maxWidth: 360 }}>
    <CalendarGrid month={month} onDayPress={(date) => alert(date)} />
  </div>
);
