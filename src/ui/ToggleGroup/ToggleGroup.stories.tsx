import type { Story, StoryDefault } from "@ladle/react";
import { useState } from "react";
import { ToggleGroup } from "./ToggleGroup";

export default {
  title: "Primitives/ToggleGroup",
} satisfies StoryDefault;

const WEEKDAYS = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
] as const;

/**
 * Decorator hint: `Tab` to the group, then arrow-key between keys and `Space`
 * to toggle. The mandatory focus ring (docs/design-system.md §3) shows on the
 * focused key; the on-state uses `--color-accent-surface`.
 */
export const MultiSelect: Story = () => {
  const [value, setValue] = useState<string[]>(["tue", "thu"]);
  return (
    <ToggleGroup aria-label="Which weekdays" value={value} onChange={setValue}>
      {WEEKDAYS.map(([key, label]) => (
        <ToggleGroup.Item key={key} value={key}>
          {label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup>
  );
};

export const SingleSelect: Story = () => {
  const [value, setValue] = useState<string[]>(["wed"]);
  return (
    <ToggleGroup
      aria-label="Primary pickup day"
      selectionMode="single"
      value={value}
      onChange={setValue}
    >
      {WEEKDAYS.map(([key, label]) => (
        <ToggleGroup.Item key={key} value={key}>
          {label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup>
  );
};

export const Uncontrolled: Story = () => (
  <ToggleGroup aria-label="Which weekdays" defaultValue={["mon"]}>
    {WEEKDAYS.map(([key, label]) => (
      <ToggleGroup.Item key={key} value={key}>
        {label}
      </ToggleGroup.Item>
    ))}
  </ToggleGroup>
);

export const Vertical: Story = () => (
  <ToggleGroup aria-label="Which weekdays" orientation="vertical" defaultValue={["fri"]}>
    {WEEKDAYS.map(([key, label]) => (
      <ToggleGroup.Item key={key} value={key}>
        {label}
      </ToggleGroup.Item>
    ))}
  </ToggleGroup>
);

export const Disabled: Story = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
    <ToggleGroup aria-label="Whole group disabled" defaultValue={["tue"]} isDisabled>
      {WEEKDAYS.map(([key, label]) => (
        <ToggleGroup.Item key={key} value={key}>
          {label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup>
    <ToggleGroup aria-label="One key disabled" defaultValue={["mon"]}>
      {WEEKDAYS.map(([key, label]) => (
        <ToggleGroup.Item key={key} value={key} isDisabled={key === "wed"}>
          {label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup>
  </div>
);
