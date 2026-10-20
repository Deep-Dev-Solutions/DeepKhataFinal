"use client";

import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";
import { API_BASE_URL } from "@/lib/auth";

/**
 * Better Auth client pointed at the (cross-origin) API. The session cookie is
 * httpOnly and set by the API, so every request must carry credentials.
 */
export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
  plugins: [usernameClient()],
});
