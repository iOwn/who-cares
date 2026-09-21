"use client";

/**
 * The browser-side Better Auth client — used by `SignInScreen` to request the
 * sign-in email (magic link) and to redeem the 6-digit code it carries
 * (issue #157), and for passkey sign-in.
 */

import { passkeyClient } from "@better-auth/passkey/client";
import { emailOTPClient, magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), emailOTPClient(), passkeyClient()],
});
