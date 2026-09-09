import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/auth";

/** Mounts every Better Auth endpoint (sign-in, magic-link verify, session, …) under `/api/auth/*`. */
export const { GET, POST } = toNextJsHandler(auth);
