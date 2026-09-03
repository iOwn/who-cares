# Direct claim overwrites any existing assignment, no confirmation step

While specifying the pickup request lifecycle (issue #3), we had to decide what a direct
claim does when it lands on a childcare day that's already assigned — either from a prior
accepted pickup request or an earlier direct claim.

We considered restricting claims to unassigned days only, requiring an explicit release
step before anyone else could claim (Option B). We rejected it: the household's standing
rule is "never auto-reassign or silently reshuffle" — but that rule constrains the
*system*, not a member acting deliberately. A direct claim is already an explicit human
action, so letting it overwrite is consistent with the rule, not a violation of it. Adding
a confirmation or release step would be friction the two-person, high-trust household
doesn't need.

So: a direct claim can target any day, assigned or not. The newest claim wins; the
previous assignee (if any) is bumped back to unassigned and, along with the other member,
notified after the fact — flagged, not blocked.
