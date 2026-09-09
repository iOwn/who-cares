import type { Story, StoryDefault } from "@ladle/react";
import { useState } from "react";
import { shiftMonth } from "../calendarMonth";
import { MonthPager } from "./MonthPager";

export default {
  title: "Composed/MonthPager",
} satisfies StoryDefault;

export const Default: Story = () => {
  const [{ year, month }, setState] = useState({ year: 2026, month: 9 });
  return (
    <div style={{ maxWidth: 360 }}>
      <MonthPager
        year={year}
        month={month}
        onPrev={() => setState(shiftMonth(year, month, -1))}
        onNext={() => setState(shiftMonth(year, month, 1))}
        onToday={() => setState({ year: 2026, month: 9 })}
        onJump={(y, m) => setState({ year: y, month: m })}
      />
    </div>
  );
};
