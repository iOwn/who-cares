# Better Auth 1.7.3: programmatic credential-user creation, hashing & bootstrap-hook firing

Research feeding decision ticket #105 (household-member seed script design). Question
source: issue #104, child of wayfinder map #101.

All facts below are sourced from this repo's own installed copy of Better Auth
(`node_modules/better-auth/package.json` → `"version": "1.7.3"`, confirmed exactly matching
the ticket's assumption — no version drift) and its `@better-auth/core@1.7.3` dependency,
read directly rather than from memory or the public docs site. Better Auth does not bundle
Markdown docs inside the npm package (`node_modules/better-auth` has no `*.md`), so every
claim here is a source-code citation with a `file:line` path; JSDoc comments that merely
*link out* to `better-auth.com` are noted as such, not treated as verified content. Also
read: this repo's `src/auth/config.ts` (current `databaseHooks.user.create.after`
household-bootstrap hook, still on the `magicLink`-only config as of this research — the
`emailAndPassword`/`disableSignUp` switch from #103 is decided but not yet implemented).

---

## TL;DR for #105

1. **Yes** — `auth.api.createUser` (from Better Auth's built-in **admin plugin**,
   `better-auth/plugins/admin` — no extra package, just add it to `plugins: []`) creates a
   user + `credential` account using Better Auth's own `ctx.context.password.hash()`, the
   *exact same* hasher object `signIn.email` calls `.verify()` on. It is a distinct endpoint
   (`POST /admin/create-user`) from `/sign-up/email` and is **not** gated by
   `emailAndPassword.disableSignUp` — that flag is only ever read inside the sign-up
   endpoint's own handler. High confidence, fully static.
2. **Yes** — the `databaseHooks.user.create.after` hook fires for admin-created users, via
   the same shared `internalAdapter.createUser` → `createWithHooks` code path that
   `signUp.email` also uses. This is structural, not caller-specific: `createWithHooks`
   iterates the config's `databaseHooks` array unconditionally, with no branching on which
   endpoint invoked it. High confidence, fully static (traced hook wiring end-to-end; no
   live test run — see caveat below).
3. Creating the user and linking the `credential` account are **two separate, non-atomic**
   calls inside the admin route (`internalAdapter.createUser` then `internalAdapter.linkAccount`
   — no transaction wraps them), and the route itself throws `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`
   on a second call for the same email rather than no-op'ing. A seed script therefore needs
   its own "does this member already exist" check-before-create, and separately needs to
   handle the user-exists-but-credential-account-missing partial state. Full idempotency
   design is #105's job — this is just the shape the underlying API forces.

---

## 1. Server-side user + credential creation, bypassing sign-up, with Better Auth's own hasher

### The API: `auth.api.createUser` (admin plugin)

Source: `node_modules/better-auth/dist/plugins/admin/routes.mjs:108-211`.

```
POST /admin/create-user
server: auth.api.createUser
client: authClient.admin.createUser
```

Body schema (`routes.mjs:108-117`): `email`, `password` (optional — "If not provided, the
user will be created without a credential account"), `name`, optional `role`, optional
`data` (extra/custom fields).

Handler logic (`routes.mjs:151-210`), summarized:

1. `getAuthoritativeSessionFromCtx(ctx)` — looks for a real admin session.
2. **Session is only required when the call carries `ctx.request` or `ctx.headers`**
   (`routes.mjs:152-153`: `if (!session && (ctx.request || ctx.headers)) throw
   ctx.error("UNAUTHORIZED")`). A direct server-side call —
   `auth.api.createUser({ body: {...} })`, no `headers` option — has neither, so this check
   is skipped entirely and **no admin session is needed**. This is a deliberate exception:
   every *other* admin route (`setRole`, `banUser`, `setUserPassword`, etc.) instead uses
   `use: [adminMiddleware]` (`routes.mjs:16-20`), which calls
   `getAuthoritativeSessionFromCtx` and unconditionally throws `UNAUTHORIZED` if there's no
   session, headers or not. `createUser` alone does not use `adminMiddleware` — confirmed by
   grepping every `use: [adminMiddleware]` occurrence in the file (12 routes; `createUser`'s
   own definition at line 133 is not one of them).
3. Email-exists guard: `ctx.context.internalAdapter.findUserByEmail(email)` → if found,
   throws `BAD_REQUEST USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` (`routes.mjs:193`).
4. Creates the user: `ctx.context.internalAdapter.createUser({...}, { method: "admin" })`
   (`routes.mjs:194-199`).
5. **If a password was given**, hashes and links it (`routes.mjs:201-208`):
   ```js
   const hashedPassword = await ctx.context.password.hash(ctx.body.password);
   await ctx.context.internalAdapter.linkAccount({
     providerId: "credential",
     accountId: user.id,
     password: hashedPassword,
     userId: user.id,
   });
   ```
   These are **two separate calls**, not wrapped in one transaction at this call site (no
   `runWithTransaction`/`db.transaction` anywhere in this handler) — see §3.

### Why the hash can't mismatch: `ctx.context.password` is one shared object

`ctx.context.password` is built once, at context-creation time, in
`node_modules/better-auth/dist/context/create-context.mjs:182-189`:

```js
password: {
  hash: options.emailAndPassword?.password?.hash || hashPassword,
  verify: options.emailAndPassword?.password?.verify || verifyPassword,
  config: { minPasswordLength: ..., maxPasswordLength: ... },
  checkPassword,
},
```

`hashPassword`/`verifyPassword` come from `node_modules/better-auth/dist/crypto/password.mjs`,
which re-exports `@better-auth/utils/password` — scrypt via Node's `node:crypto` when
available, falling back to `@noble/hashes` scrypt otherwise (per that file's own comment,
lines 4-8).

`signIn.email` (`node_modules/better-auth/dist/api/routes/sign-in.mjs:329`) verifies with
`ctx.context.password.verify({...})` — the *same* `context.password` object the admin route
hashed with. There's exactly one hash/verify pair per Better Auth instance (or one
repo-supplied custom pair, if `emailAndPassword.password.{hash,verify}` is ever set — not
currently set in `src/auth/config.ts`), so admin-created and normal-signup credentials are
verified identically by construction. A hand-rolled hash (e.g. bcrypt from an unrelated
library) would indeed silently mismatch; `ctx.context.password.hash` avoids that class of
bug entirely.

### Confirmed: this path is untouched by `disableSignUp`

`disableSignUp` is read in exactly one place in the whole package:
`node_modules/better-auth/dist/api/routes/sign-up.mjs:144`, inside the `/sign-up/email`
handler itself. It does not appear anywhere in `plugins/admin/routes.mjs`. So
`emailAndPassword: { enabled: true, disableSignUp: true }` has zero effect on
`auth.api.createUser` — confirmed by grep across both files, not inference.

### What this repo needs to change to use it

The `admin` plugin (`better-auth/plugins/admin`) is not currently in `src/auth/config.ts`'s
`plugins: []` array (only `magicLink`, `passkey`, `nextCookies` are there today, per the
file read for this research). It ships inside the already-installed `better-auth` package
(confirmed via its `package.json` `exports` map: `"./plugins/admin"` is listed alongside
`"./plugins/magic-link"` etc. — no new dependency to add). Adding it is a config change, not
a code path #105 needs to build from scratch — noted here as a fact for #105, not designed
further per this ticket's scope.

---

## 2. Does `databaseHooks.user.create.after` fire for admin-created users?

**Yes, with high confidence, traced statically end-to-end. Not confirmed by a live/integration
run — see caveat at the end of this section.**

### The shared code path

Both creation routes bottom out in the same two adapter calls:

- `signUp.email`: `node_modules/better-auth/dist/api/routes/sign-up.mjs:224`
  (`ctx.context.internalAdapter.createUser(...)`) then `:242` (`internalAdapter.linkAccount`).
- `admin.createUser`: `routes.mjs:194` (`internalAdapter.createUser(...)`) then `:203`
  (`internalAdapter.linkAccount`).

Both `internalAdapter.createUser` and `internalAdapter.linkAccount` are themselves thin
wrappers: `node_modules/better-auth/dist/db/internal-adapter.mjs:140-169` shows
`createUser` ends in `return await createWithHooks(data, "user", void 0);` — no
caller-specific branching, no `source`/`method` field read here.

`createWithHooks` is defined once, in
`node_modules/better-auth/dist/db/with-hooks.mjs:4-42`, shared by every model/every caller.
The relevant lines:

```js
for (const { source, hooks } of hooksEntries) {
  const toRun = hooks[model]?.create?.after;
  if (toRun) await queueAfterTransactionHook(async () => {
    await withSpan(`db create.after ${model}`, {...}, () => toRun(created, context));
  });
}
```

`hooksEntries` is `ctx.hooks`, which is populated directly from the top-level
`databaseHooks` config option — confirmed in
`node_modules/better-auth/dist/context/helpers.mjs:22-25,43-45` (`if (options.databaseHooks)
dbHooks.push({ ..., hooks: options.databaseHooks })`) — i.e. this repo's
`databaseHooks.user.create.after` in `src/auth/config.ts:100-125` (the `bootstrapHousehold`
transaction) is exactly one of these `hooksEntries`, wired the same way no matter which
endpoint triggered the create. There is no `if (source === "admin") skip hooks` or similar
anywhere in `with-hooks.mjs` or `internal-adapter.mjs`.

### Does it still fire outside an HTTP request (a plain seed script calling `auth.api.createUser` directly)?

Yes. `queueAfterTransactionHook`
(`node_modules/.pnpm/@better-auth+core@.../@better-auth/core/dist/context/transaction.mjs:96-114`)
is scoped to Better Auth's **DB-adapter transaction** AsyncLocalStorage, not to an HTTP
request/response cycle:

```js
const queueAfterTransactionHook = async (hook, options) => {
  const executeHook = async () => { ... };
  let storage;
  try { storage = await ensureAsyncStorage(); } catch { return executeHook(); }
  const store = storage.getStore();
  if (!store?.isTransactionActive) return executeHook();  // runs immediately
  store.pendingHooks.push(executeHook);                    // runs after commit
};
```

If there's no active adapter transaction around the call (the normal case for
`admin.createUser` — its handler doesn't wrap `internalAdapter.createUser` +
`internalAdapter.linkAccount` in one `db.transaction`/`runWithTransaction`, unlike this
repo's own `bootstrapHousehold` call), the `create.after` hook runs **immediately, inline**,
regardless of whether the outer call came from an HTTP request or a bare Node script calling
`auth.api.createUser({ body: {...} })` directly. So a seed script run with `tsx` or similar,
importing `auth` from `src/auth/config.ts` and calling `auth.api.createUser(...)`, should
fire `bootstrapHousehold` the same as a browser sign-up would.

One caveat worth flagging for #105: this repo's `user.validateUserInfo` (the allowlist gate,
`src/auth/config.ts:94-97`) is also invoked from inside `internalAdapter.createUser`
(`internal-adapter.mjs:147-167`), gated on `getCurrentAuthEndpointContext()` being set — it
throws a hard `FORBIDDEN` if not. That context is established by `createAuthEndpoint`'s
`wrapEndpointHandler`
(`node_modules/.pnpm/@better-auth+core@.../@better-auth/core/dist/api/index.mjs:51-62`,
`runWithEndpointContext(context, () => handler(context))`), which wraps *every* endpoint
invocation uniformly — both the HTTP router path and the direct `auth.api.X(...)` call use
the same `createEndpoint`-produced function, so the endpoint context is present either way.
Confirmed statically; not exercised live. Whatever gate ends up replacing/keeping
`validateUserInfo` after the `emailAndPassword` switch (#103/#105's concern, not this
ticket's) will run for admin-created users too, and needs to allow the seeded emails.

### Confidence / static-vs-live caveat

Every link in this chain (`admin.createUser` → `internalAdapter.createUser` →
`createWithHooks` → `databaseHooks.user.create.after` → `queueAfterTransactionHook`) was
read directly in the installed 1.7.3 source and the wiring has no caller-conditional branches
— so this is about as strong as static reading gets. That said, it has **not** been verified
by actually running `auth.api.createUser` against this repo's dev DB and observing
`bootstrapHousehold` execute (no test harness was run for this research ticket, per its
scope). #105 should include one live smoke check (call the seed path once against a scratch
DB, assert the Household/Members/Child rows exist) before trusting this in production,
especially since `bootstrapHousehold` runs inside its own `db.transaction(...)` nested under
whatever adapter transaction (if any) Better Auth itself has open — untested transaction
nesting is the one place static reading is weakest.

---

## 3. Shape of idempotent re-invocation (facts only — #105 designs the actual script)

Facts from the source that constrain #105's design:

- **User creation is check-then-create, and the check is Better Auth's, not idempotent on
  its own.** `routes.mjs:193`: a second `auth.api.createUser` call for the same email throws
  `APIError.from("BAD_REQUEST", ADMIN_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL)`. It
  does not return the existing user or silently succeed. A re-runnable seed needs to treat
  that specific error (or a prior `findUserByEmail`-style check) as "already seeded", not as
  a failure.
- **User-create and credential-link are two non-atomic calls** (`routes.mjs:194` then
  `:201-208`), with no transaction wrapping them in the admin route itself. If the process
  dies between the two (e.g. seed script crashes, DB blip), the result is a user row with
  no `credential` account — a partial state a naive "does the user exist?" check would treat
  as "already seeded" and skip, leaving that household member unable to sign in. A robust
  seed needs to check for the *credential account specifically* (e.g. via
  `ctx.context.internalAdapter` account lookups, or listing accounts for the user), not just
  the user row.
- **Password *value* isn't re-checked by `createUser`.** It only ever hashes+links a password
  on first creation (`if (ctx.body.password) { ... }`, `routes.mjs:201`) — there's no
  "update password if different" branch in this endpoint. Changing `MEMBER_A_PASSWORD` after
  the first seed run and re-running the same `createUser` call would error on
  `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` before ever touching the password, i.e. it would
  **not** pick up the new password. `admin.setUserPassword` exists for updating a password
  (`routes.mjs:783-834`+) but — unlike `createUser` — it's one of the routes gated by
  `adminMiddleware` (`use: [adminMiddleware]`, `routes.mjs:806`), which calls
  `getAuthoritativeSessionFromCtx` and throws `UNAUTHORIZED` **unconditionally**, headers or
  not (`routes.mjs:16-20`) — so it cannot be called from a bare script without a real admin
  session already established. This is a real constraint for #105: "rotate a seeded
  member's password by re-running the seed" is not free with these two endpoints alone.
- No built-in "upsert" or "createOrGetUser" endpoint exists anywhere in
  `node_modules/better-auth/dist` (grepped `plugins/admin/routes.mjs` and
  `db/internal-adapter.mjs` for anything upsert-shaped) — idempotency is entirely the
  caller's responsibility, built from `findUserByEmail`-style reads plus handling the
  specific `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` error code.

None of the above is a recommendation for how #105 should structure the seed script (env var
names, script location, retry strategy) — that's explicitly out of scope for this ticket and
is #105's job, using these constraints as inputs.

---

## Sources (all local, all 1.7.3-pinned)

- `node_modules/better-auth/package.json` — version confirmation.
- `node_modules/better-auth/dist/plugins/admin/routes.mjs` — `createUser`, `setUserPassword`,
  `adminMiddleware` definitions.
- `node_modules/better-auth/dist/api/routes/sign-up.mjs` — `signUp.email` handler,
  `disableSignUp` check.
- `node_modules/better-auth/dist/api/routes/sign-in.mjs` — `signIn.email` password
  verification call site.
- `node_modules/better-auth/dist/db/internal-adapter.mjs` — `createUser`, `createOAuthUser`,
  `linkAccount` (via `createWithHooks`).
- `node_modules/better-auth/dist/db/with-hooks.mjs` — `createWithHooks`, the shared
  hook-firing mechanism.
- `node_modules/better-auth/dist/context/create-context.mjs` — `ctx.context.password`
  construction.
- `node_modules/better-auth/dist/context/helpers.mjs` — `databaseHooks` → `ctx.hooks` wiring.
- `node_modules/better-auth/dist/crypto/password.mjs` — hash/verify implementation
  (scrypt via `@better-auth/utils/password`).
- `node_modules/.pnpm/@better-auth+core@1.7.3.../@better-auth/core/dist/context/transaction.mjs`
  — `queueAfterTransactionHook`, transaction-scoped (not request-scoped) hook firing.
- `node_modules/.pnpm/@better-auth+core@1.7.3.../@better-auth/core/dist/context/endpoint-context.mjs`
  and `.../api/index.mjs` — `runWithEndpointContext`/`wrapEndpointHandler`, confirming
  endpoint context is established uniformly for both HTTP and direct `auth.api.X()` calls.
- `src/auth/config.ts` (this repo) — current `databaseHooks.user.create.after`
  (`bootstrapHousehold`) and `user.validateUserInfo` (allowlist gate) implementations.

No bundled Markdown docs exist in `node_modules/better-auth` for this version; JSDoc comments
in the source link out to `better-auth.com/docs/...` but those pages were not fetched for
this research — all claims above are from the shipped source itself.
