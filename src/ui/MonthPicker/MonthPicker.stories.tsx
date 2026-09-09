import type { Story, StoryDefault } from "@ladle/react";
import { useState } from "react";
import { Button } from "../Button";
import { DialogTrigger } from "../Dialog";
import { MonthPicker } from "./MonthPicker";

export default {
  title: "Composed/MonthPicker",
} satisfies StoryDefault;

export const Default: Story = () => {
  const [picked, setPicked] = useState({ year: 2026, month: 9 });
  return (
    <div>
      <DialogTrigger>
        <Button variant="secondary">
          {picked.year}-{String(picked.month).padStart(2, "0")}
        </Button>
        <MonthPicker
          year={picked.year}
          month={picked.month}
          onSelect={(year, month) => setPicked({ year, month })}
        />
      </DialogTrigger>
    </div>
  );
};
