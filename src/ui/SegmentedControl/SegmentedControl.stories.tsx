import type { Story, StoryDefault } from "@ladle/react";
import { useState } from "react";
import { SegmentedControl } from "./SegmentedControl";

export default {
  title: "Primitives/SegmentedControl",
} satisfies StoryDefault;

/**
 * Decorator hint: `Tab` to the control (only the selected segment is in the tab
 * order), then use `ArrowLeft` / `ArrowRight` — focus and selection move
 * together, and the mandatory focus ring (docs/design-system.md §3) shows.
 */
export const TwoSegments: Story = () => {
  const [value, setValue] = useState("grid");
  return (
    <SegmentedControl aria-label="Calendar view" value={value} onChange={setValue}>
      <SegmentedControl.Item value="grid">Grid</SegmentedControl.Item>
      <SegmentedControl.Item value="list">List</SegmentedControl.Item>
    </SegmentedControl>
  );
};

export const ThreeSegments: Story = () => {
  const [value, setValue] = useState("month");
  return (
    <SegmentedControl aria-label="Range" value={value} onChange={setValue}>
      <SegmentedControl.Item value="week">Week</SegmentedControl.Item>
      <SegmentedControl.Item value="month">Month</SegmentedControl.Item>
      <SegmentedControl.Item value="agenda">Agenda</SegmentedControl.Item>
    </SegmentedControl>
  );
};

export const Uncontrolled: Story = () => (
  <SegmentedControl aria-label="Absence type" defaultValue="oneoff">
    <SegmentedControl.Item value="oneoff">One-off</SegmentedControl.Item>
    <SegmentedControl.Item value="recurring">Recurring</SegmentedControl.Item>
  </SegmentedControl>
);

export const Disabled: Story = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
    <SegmentedControl aria-label="Whole control disabled" defaultValue="grid" isDisabled>
      <SegmentedControl.Item value="grid">Grid</SegmentedControl.Item>
      <SegmentedControl.Item value="list">List</SegmentedControl.Item>
    </SegmentedControl>
    <SegmentedControl aria-label="One segment disabled" defaultValue="grid">
      <SegmentedControl.Item value="grid">Grid</SegmentedControl.Item>
      <SegmentedControl.Item value="list">List</SegmentedControl.Item>
      <SegmentedControl.Item value="agenda" isDisabled>
        Agenda
      </SegmentedControl.Item>
    </SegmentedControl>
  </div>
);
