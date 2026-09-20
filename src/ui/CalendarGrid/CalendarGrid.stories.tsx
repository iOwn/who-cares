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

/** The "hide weekend days" preference (#130) — five columns, same width. */
const weekdaysOnly = buildCalendarMonth({
  year: 2025,
  month: 9,
  pattern: monToFri,
  closures: [{ id: "c1", householdId: "h", date: "2025-09-10", reason: "Staff training" }],
  today: "2025-09-15",
  hideWeekends: true,
});

export const WeekendsHidden: Story = () => (
  <div style={{ maxWidth: 360 }}>
    <CalendarGrid month={weekdaysOnly} />
  </div>
);

/**
 * The same preference against a household with Saturday childcare: the
 * Saturday column stays, because hiding it would bury a real pickup day.
 */
const withSaturdayCare = buildCalendarMonth({
  year: 2025,
  month: 9,
  pattern: {
    id: "h",
    householdId: "h",
    versions: [
      { weekdays: ["mon", "tue", "wed", "thu", "fri", "sat"], effectiveFrom: "2025-01-06" },
    ],
  },
  closures: [],
  today: "2025-09-15",
  hideWeekends: true,
});

export const WeekendsHiddenWithSaturdayChildcare: Story = () => (
  <div style={{ maxWidth: 360 }}>
    <CalendarGrid month={withSaturdayCare} />
  </div>
);
