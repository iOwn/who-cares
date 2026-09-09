import type { Story, StoryDefault } from "@ladle/react";
import type { ReactNode } from "react";
import { RecurringPreview } from "./RecurringPreview";

export default {
  title: "Composed/RecurringPreview",
} satisfies StoryDefault;

function Stack({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gap: "1rem", maxWidth: "24rem" }}>{children}</div>;
}

export const Default: Story = () => (
  <Stack>
    <RecurringPreview toCreate={4} alreadyCovered={0} capped={false} />
    <RecurringPreview toCreate={2} alreadyCovered={1} capped={false} />
    <RecurringPreview toCreate={3} alreadyCovered={0} capped />
    <RecurringPreview toCreate={0} alreadyCovered={3} capped={false} />
    <RecurringPreview toCreate={0} alreadyCovered={0} capped={false} />
  </Stack>
);
