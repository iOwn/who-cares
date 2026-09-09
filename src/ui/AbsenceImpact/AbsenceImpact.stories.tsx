import type { Story, StoryDefault } from "@ladle/react";
import type { ReactNode } from "react";
import { AbsenceImpact } from "./AbsenceImpact";

export default {
  title: "Composed/AbsenceImpact",
} satisfies StoryDefault;

function Stack({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gap: "1rem", maxWidth: "24rem" }}>{children}</div>;
}

export const Default: Story = () => (
  <Stack>
    <AbsenceImpact childcareDays={3} requests={2} otherParentName="Bailey" />
    <AbsenceImpact childcareDays={1} requests={1} otherParentName="Bailey" />
    <AbsenceImpact childcareDays={4} requests={0} otherParentName="Bailey" />
    <AbsenceImpact childcareDays={0} requests={0} otherParentName="Bailey" />
  </Stack>
);
