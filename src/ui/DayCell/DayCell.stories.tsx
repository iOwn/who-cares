import type { Story, StoryDefault } from "@ladle/react";
import type { ReactNode } from "react";
import { DayCell } from "./DayCell";

export default {
  title: "Composed/DayCell",
} satisfies StoryDefault;

function Grid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 84px)",
        gap: "6px",
      }}
    >
      {children}
    </div>
  );
}

export const States: Story = () => (
  <Grid>
    <DayCell dayOfMonth={1} state="quiet" />
    <DayCell dayOfMonth={2} state="off" />
    <DayCell dayOfMonth={3} state="closed" whoLabel="closed" />
    <DayCell dayOfMonth={4} state="resolved" whoLabel="Inki" />
    <DayCell dayOfMonth={5} state="pending" whoLabel="asked Honi" />
    <DayCell dayOfMonth={6} state="at-risk" whoLabel="both out" />
  </Grid>
);

export const Today: Story = () => (
  <Grid>
    <DayCell dayOfMonth={9} state="quiet" isToday />
    <DayCell dayOfMonth={10} state="at-risk" whoLabel="both out" isToday />
    <DayCell dayOfMonth={11} state="off" isToday />
  </Grid>
);

export const Pressable: Story = () => (
  <Grid>
    <DayCell dayOfMonth={12} state="quiet" onPress={() => alert("open day detail")} />
    <DayCell dayOfMonth={13} state="closed" whoLabel="closed" onPress={() => {}} />
    <DayCell dayOfMonth={14} state="quiet" onPress={() => {}} isDisabled />
  </Grid>
);
