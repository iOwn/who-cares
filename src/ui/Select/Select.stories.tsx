import type { Story, StoryDefault } from "@ladle/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Select } from "./Select";

export default {
  title: "Primitives/Select",
} satisfies StoryDefault;

function Stack({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gap: "1rem", maxWidth: "22rem" }}>{children}</div>;
}

const STATE_OPTIONS = [
  { value: "BW", label: "Baden-Württemberg" },
  { value: "BY", label: "Bayern" },
  { value: "BE", label: "Berlin" },
  { value: "NW", label: "Nordrhein-Westfalen" },
] as const;

export const Default: Story = () => (
  <Stack>
    <Select label="Bundesland" placeholder="None" options={STATE_OPTIONS} />
    <Select label="Bundesland" placeholder="None" options={STATE_OPTIONS} defaultValue="BY" />
  </Stack>
);

export const WithDescription: Story = () => (
  <Stack>
    <Select
      label="Bundesland"
      description="Public holidays for this state are added to the calendar automatically."
      placeholder="None"
      options={STATE_OPTIONS}
    />
  </Stack>
);

export const RequiredAndOptional: Story = () => (
  <Stack>
    <Select label="Required" isRequired options={STATE_OPTIONS} />
    <Select label="Optional" isOptional placeholder="None" options={STATE_OPTIONS} />
  </Stack>
);

export const Invalid: Story = () => (
  <Stack>
    <Select label="Bundesland" options={STATE_OPTIONS} isInvalid errorMessage="Pick a state." />
  </Stack>
);

export const Disabled: Story = () => (
  <Stack>
    <Select label="Bundesland" options={STATE_OPTIONS} defaultValue="BY" isDisabled />
  </Stack>
);

export const Controlled: Story = () => {
  const [value, setValue] = useState<(typeof STATE_OPTIONS)[number]["value"] | null>("BE");
  return (
    <Stack>
      <Select
        label="Controlled"
        placeholder="None"
        options={STATE_OPTIONS}
        value={value}
        onChange={setValue}
      />
      <p style={{ fontSize: "0.75rem" }}>value: {value ?? "null"}</p>
    </Stack>
  );
};
