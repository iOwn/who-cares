import type { Story, StoryDefault } from "@ladle/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { TextField } from "./TextField";

export default {
  title: "Primitives/TextField",
} satisfies StoryDefault;

/** Stack the fields; nothing here is design-system styling. */
function Stack({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gap: "1rem", maxWidth: "22rem" }}>{children}</div>;
}

/**
 * Decorator hint: `Tab` into any field to eyeball the mandatory
 * `[data-focus-visible]` ring (docs/design-system.md §3). The Ladle a11y addon
 * also runs an axe pass on every story.
 */
export const Default: Story = () => (
  <Stack>
    <TextField label="Label" defaultValue="Weekly groceries" />
    <TextField label="With placeholder" placeholder="e.g. School run" />
  </Stack>
);

export const WithDescription: Story = () => (
  <Stack>
    <TextField
      label="Label"
      description="Shown to the other parent when they get the request."
      defaultValue="Swimming pickup"
    />
  </Stack>
);

export const RequiredAndOptional: Story = () => (
  <Stack>
    <TextField label="Reason" isRequired defaultValue="Dentist" />
    <TextField label="Note" isOptional placeholder="Anything they should know" />
  </Stack>
);

export const Invalid: Story = () => (
  <Stack>
    <TextField
      label="Label"
      defaultValue=""
      isInvalid
      errorMessage="Give the absence a short reason."
    />
  </Stack>
);

export const Disabled: Story = () => (
  <Stack>
    <TextField label="Label" defaultValue="Can't touch this" isDisabled />
  </Stack>
);

export const Controlled: Story = () => {
  const [value, setValue] = useState("");
  return (
    <Stack>
      <TextField label="Controlled" value={value} onChange={setValue} placeholder="Type here" />
      <p style={{ fontSize: "0.75rem" }}>value: {JSON.stringify(value)}</p>
    </Stack>
  );
};
