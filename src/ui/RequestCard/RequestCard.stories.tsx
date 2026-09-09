import type { Story, StoryDefault } from "@ladle/react";
import type { ReactNode } from "react";
import { Button } from "../Button";
import { RequestCard } from "./RequestCard";

export default {
  title: "Feature/RequestCard",
} satisfies StoryDefault;

function Stack({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gap: "1rem", maxWidth: "26rem" }}>{children}</div>;
}

const NOW = new Date("2025-01-10T12:00:00.000Z");

export const Open: Story = () => (
  <Stack>
    <RequestCard
      requesterName="Alex"
      dateLabel="Mon, Jan 13"
      raisedAt={new Date(NOW.getTime() - 3 * 60 * 60 * 1000)}
      now={NOW}
    />
  </Stack>
);

export const WithActions: Story = () => (
  <Stack>
    <RequestCard
      requesterName="Alex"
      dateLabel="Mon, Jan 13"
      raisedAt={new Date(NOW.getTime() - 5 * 60 * 60 * 1000)}
      now={NOW}
      actions={
        <>
          <Button variant="primary" size="sm">
            Accept
          </Button>
          <Button variant="secondary" size="sm">
            Decline
          </Button>
        </>
      }
    />
  </Stack>
);

export const Escalating: Story = () => (
  <Stack>
    <RequestCard
      requesterName="Bailey"
      dateLabel="Tue, Jan 14"
      raisedAt={new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000)}
      now={NOW}
      escalating
    />
  </Stack>
);
