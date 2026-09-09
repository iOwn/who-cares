"use client";

/** The browser-side Better Auth client — used by `SignInScreen` to request a magic link. */

import { passkeyClient } from "@better-auth/passkey/client";
import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), passkeyClient()],
});
