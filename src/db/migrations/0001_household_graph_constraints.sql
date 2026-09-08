-- Custom migration (`pnpm db:generate:custom`). Drizzle's schema diff cannot
-- express triggers, so the "exactly two members / exactly one child" half of the
-- household invariant is hand-written here.
--
-- `0000_root_graph` already caps a household from above: `UNIQUE (household_id,
-- slot)` plus `CHECK (slot IN (1, 2))` allow at most two members, and `UNIQUE
-- (household_id)` on `children` allows at most one child. What no row-level
-- constraint can say is "at *least* two members and exactly one child", because
-- the household row necessarily exists for a moment before its members do.
--
-- Hence DEFERRABLE INITIALLY DEFERRED constraint triggers: the counts are
-- checked once, at COMMIT, so a household may be assembled statement by
-- statement inside a transaction. The practical consequence — documented in
-- `src/db/repositories/` and exercised by the integration tests — is that
-- creating a household is always a transaction, never a lone INSERT.

CREATE FUNCTION check_household_graph(target_id text) RETURNS void AS $$
DECLARE
  member_count integer;
  child_count integer;
BEGIN
  IF target_id IS NULL THEN
    RETURN;
  END IF;

  -- The household is gone (e.g. this trigger is firing for the ON DELETE
  -- CASCADE that removed its members). Nothing left to be complete.
  IF NOT EXISTS (SELECT 1 FROM households WHERE id = target_id) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO member_count FROM members WHERE household_id = target_id;
  IF member_count <> 2 THEN
    RAISE EXCEPTION 'household % must have exactly two members, found %', target_id, member_count
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO child_count FROM children WHERE household_id = target_id;
  IF child_count <> 1 THEN
    RAISE EXCEPTION 'household % must have exactly one child, found %', target_id, child_count
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- For `members` / `children`: re-check whichever household(s) the row touched.
CREATE FUNCTION household_graph_child_trigger() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM check_household_graph(OLD.household_id);
  ELSE
    PERFORM check_household_graph(NEW.household_id);
    IF TG_OP = 'UPDATE' AND OLD.household_id IS DISTINCT FROM NEW.household_id THEN
      PERFORM check_household_graph(OLD.household_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- For `households` itself: a freshly inserted household must have acquired its
-- two members and one child by the time the transaction commits.
CREATE FUNCTION household_graph_root_trigger() RETURNS trigger AS $$
BEGIN
  PERFORM check_household_graph(NEW.id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER households_graph_complete
  AFTER INSERT ON households
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION household_graph_root_trigger();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER members_graph_complete
  AFTER INSERT OR UPDATE OR DELETE ON members
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION household_graph_child_trigger();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER children_graph_complete
  AFTER INSERT OR UPDATE OR DELETE ON children
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION household_graph_child_trigger();
