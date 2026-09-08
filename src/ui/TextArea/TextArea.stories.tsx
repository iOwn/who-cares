import type { Story, StoryDefault } from "@ladle/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { TextArea } from "./TextArea";

export default {
  title: "Primitives/TextArea",
} satisfies StoryDefault;

function Stack({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gap: "1rem", maxWidth: "22rem" }}>{children}</div>;
}

/**
 * Decorator hint: `Tab` into the field to eyeball the mandatory
 * `[data-focus-visible]` ring (docs/design-system.md §3).
 */
export const Default: Story = () => (
  <Stack>
    <TextArea label="Note" placeholder="Anything the other parent should know" />
  </Stack>
);

export const WithDescription: Story = () => (
  <Stack>
    <TextArea
      label="Note"
      description="Optional — appears under the absence in their inbox."
      defaultValue={"Back-to-back meetings all afternoon.\nCall if anything comes up."}
      rows={4}
    />
  </Stack>
);

export const RequiredAndOptional: Story = () => (
  <Stack>
    <TextArea label="Reason" isRequired defaultValue="Out of town for work" />
    <TextArea label="Note" isOptional placeholder="Optional details" />
  </Stack>
);

export const Invalid: Story = () => (
  <Stack>
    <TextArea label="Reason" defaultValue="" isInvalid errorMessage="A short reason is required." />
  </Stack>
);

export const Disabled: Story = () => (
  <Stack>
    <TextArea
      label="Note"
      defaultValue="Locked while the request is pending."
      isDisabled
      rows={3}
    />
  </Stack>
);

export const Controlled: Story = () => {
  const [value, setValue] = useState("");
  return (
    <Stack>
      <TextArea label="Controlled" value={value} onChange={setValue} placeholder="Type here" />
      <p style={{ fontSize: "0.75rem" }}>length: {value.length}</p>
    </Stack>
  );
};
