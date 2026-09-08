import type { Story, StoryDefault } from "@ladle/react";
import { Info, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../Button";
import { Callout } from "./Callout";

export default {
  title: "Primitives/Callout",
} satisfies StoryDefault;

function Stack({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gap: "1rem", maxWidth: "24rem" }}>{children}</div>;
}

/** One per `tone`. */
export const Tones: Story = () => (
  <Stack>
    <Callout tone="danger" dot>
      2 days need someone for Carlito.
    </Callout>
    <Callout tone="info" icon={Info}>
      Covers <b>2 childcare days</b> — Inki gets a pickup request for each.
    </Callout>
    <Callout tone="neutral" icon={Info}>
      Nothing to action right now.
    </Callout>
  </Stack>
);

/** The at-risk nudge from the Main screen — `dot` marker + inline action. */
export const AtRiskNudge: Story = () => (
  <Stack>
    <Callout
      tone="danger"
      dot
      action={
        <Button variant="ghost" tone="danger" size="sm">
          Review ›
        </Button>
      }
    >
      2 days need someone for Carlito.
    </Callout>
  </Stack>
);

/** The recurring-absence preview — `title` + `footnote`. */
export const WithTitleAndFootnote: Story = () => (
  <Stack>
    <Callout
      tone="info"
      icon={RefreshCw}
      title="Creates 6 one-off absences"
      footnote="Days you're already covering are skipped — safe to run again."
    >
      Tue 9 Sep, Thu 11 Sep, Tue 16 Sep, Thu 18 Sep, Tue 23 Sep, Thu 25 Sep.
    </Callout>
  </Stack>
);

/** The submit-error use — the feature passes `role="alert"` through. */
export const SubmitError: Story = () => (
  <Stack>
    <Callout tone="danger" icon={Info} role="alert" title="Couldn't save">
      Something went wrong reaching the server. Check your connection and try again.
    </Callout>
  </Stack>
);
