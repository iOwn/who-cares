import type { Story, StoryDefault } from "@ladle/react";
import { ClosureRow } from "./ClosureRow";

export default {
  title: "Composed/ClosureRow",
} satisfies StoryDefault;

const noop = () => {};

export const SingleDay: Story = () => (
  <div style={{ maxWidth: "24rem" }}>
    <ClosureRow
      title="Mon, Aug 4, 2026"
      reason="Staff training"
      kind="Care at home"
      onEdit={noop}
      onRemove={noop}
    />
  </div>
);

export const Range: Story = () => (
  <div style={{ maxWidth: "24rem" }}>
    <ClosureRow
      title="Mon, Aug 4 – Fri, Aug 8, 2026"
      dayCount={5}
      reason="Summer break"
      kind="No care needed"
      removeLabel="Remove Mon, Aug 4 – Fri, Aug 8, 2026"
      onEdit={noop}
      onRemove={noop}
    />
  </div>
);

export const RemoveDisabled: Story = () => (
  <div style={{ maxWidth: "24rem" }}>
    <ClosureRow
      title="Tue, Aug 5, 2026"
      kind="Care at home"
      isRemoveDisabled
      onEdit={noop}
      onRemove={noop}
    />
  </div>
);

export const LongReason: Story = () => (
  <div style={{ maxWidth: "20rem" }}>
    <ClosureRow
      title="Mon, Aug 4 – Fri, Aug 8, 2026"
      dayCount={5}
      reason="Facility closed for the annual deep clean, fire-safety inspection and staff retreat"
      kind="Care at home"
      onEdit={noop}
      onRemove={noop}
    />
  </div>
);
