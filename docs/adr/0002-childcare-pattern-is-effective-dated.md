# Childcare pattern is versioned by effective date, not a single mutable value

While modeling the childcare pattern and closures (issue #6), we had to decide how a
household's weekly pickup schedule changes over time, given that childcare day is a
*derived* concept (pattern + closures), never a stored record.

We considered a single mutable pattern with no history (simplest to build), but a change
would retroactively reshape which past dates counted as childcare days — silently altering
the meaning of absences, requests, and assignments already recorded against them. We also
considered freezing the pattern at household setup with no change operation at all, but
rejected it as too restrictive: a household's weekly rhythm can genuinely shift (e.g. 3
days/week to 5).

So: the childcare pattern is a small ordered list of `{weekdays, effectiveFrom}` versions.
Deriving the childcare days for a given date always uses whichever version was in effect on
that date, keeping past derivation stable even as the household's current pattern changes.

**Consequences**: any code deriving "childcare day" for a date must resolve the pattern
version in effect at that date, not just read a single current value.
