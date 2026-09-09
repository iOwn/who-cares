import type { Story, StoryDefault } from "@ladle/react";
import { StatePill } from "../StatePill";
import { ListRow } from "./ListRow";

export default {
  title: "Composed/ListRow",
} satisfies StoryDefault;

export const Static: Story = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "320px" }}>
    <ListRow>
      <span style={{ display: "block", fontWeight: "bold" }}>Monday, Sep 8</span>
      <span style={{ display: "block", marginTop: "2px", fontSize: "14px", color: "#666" }}>
        Both out
      </span>
    </ListRow>
    <ListRow>
      <span style={{ display: "block", fontWeight: "bold" }}>Thursday, Sep 11</span>
      <span style={{ display: "block", marginTop: "2px", fontSize: "14px", color: "#666" }}>
        Asked Honi
      </span>
    </ListRow>
  </div>
);

export const WithTrailingPill: Story = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "320px" }}>
    <ListRow trailing={<StatePill state="resolved" size="sm" />}>
      <span style={{ display: "block", fontWeight: "bold" }}>Wednesday, Sep 9</span>
      <span style={{ display: "block", marginTop: "2px", fontSize: "14px", color: "#666" }}>
        Sorted
      </span>
    </ListRow>
    <ListRow trailing={<StatePill state="pending" size="sm" />}>
      <span style={{ display: "block", fontWeight: "bold" }}>Friday, Sep 13</span>
      <span style={{ display: "block", marginTop: "2px", fontSize: "14px", color: "#666" }}>
        Waiting
      </span>
    </ListRow>
    <ListRow trailing={<StatePill state="at-risk" size="sm" />}>
      <span style={{ display: "block", fontWeight: "bold" }}>Saturday, Sep 14</span>
      <span style={{ display: "block", marginTop: "2px", fontSize: "14px", color: "#666" }}>
        At risk
      </span>
    </ListRow>
  </div>
);

export const Pressable: Story = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "320px" }}>
    <ListRow
      onPress={() => alert("Row pressed")}
      trailing={<StatePill state="resolved" size="sm" />}
    >
      <span style={{ display: "block", fontWeight: "bold" }}>Monday, Sep 8</span>
      <span style={{ display: "block", marginTop: "2px", fontSize: "14px", color: "#666" }}>
        Sorted
      </span>
    </ListRow>
    <ListRow
      onPress={() => alert("Row pressed")}
      trailing={<StatePill state="at-risk" size="sm" />}
    >
      <span style={{ display: "block", fontWeight: "bold" }}>Tuesday, Sep 9</span>
      <span style={{ display: "block", marginTop: "2px", fontSize: "14px", color: "#666" }}>
        At risk
      </span>
    </ListRow>
    <ListRow onPress={() => {}} isDisabled trailing={<StatePill state="pending" size="sm" />}>
      <span style={{ display: "block", fontWeight: "bold" }}>Wednesday, Sep 10</span>
      <span style={{ display: "block", marginTop: "2px", fontSize: "14px", color: "#666" }}>
        Waiting (disabled)
      </span>
    </ListRow>
  </div>
);
