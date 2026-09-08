import type { Story, StoryDefault } from "@ladle/react";
import { CalendarCheck, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../Button";
import { EmptyState } from "./EmptyState";

export default {
  title: "Primitives/EmptyState",
} satisfies StoryDefault;

function Frame({ children }: { children: ReactNode }) {
  return <div style={{ maxWidth: "24rem" }}>{children}</div>;
}

/** The inbox, all caught up. */
export const InboxCaughtUp: Story = () => (
  <Frame>
    <EmptyState
      icon={Inbox}
      title="You're all caught up"
      description="No requests waiting on you."
    />
  </Frame>
);

/** The list with no notable days. */
export const ListQuiet: Story = () => (
  <Frame>
    <EmptyState
      icon={CalendarCheck}
      title="Nothing needs a look"
      description="Quiet days and weekends are hidden — switch to Grid to see the whole month."
    />
  </Frame>
);

/** First run — with an action. */
export const WithAction: Story = () => (
  <Frame>
    <EmptyState
      icon={CalendarCheck}
      title="No childcare pattern yet"
      description="Set which weekdays need a pickup to start tracking."
      action={<Button variant="primary">Set it up</Button>}
    />
  </Frame>
);

/** No icon. */
export const TitleOnly: Story = () => (
  <Frame>
    <EmptyState title="Nothing here" />
  </Frame>
);
