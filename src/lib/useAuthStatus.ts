import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { getRuntimeEnv } from "./runtimeEnv";

export function useAuthStatus() {
  const auth = useConvexAuth();
  const devAuthEnabled = getRuntimeEnv("VITE_ENABLE_DEV_AUTH") === "1";
  // Internal-registry mode: with no login flow, default to the fixed "system"
  // user. The backend resolves users.me to the system identity (see
  // convex/lib/access.ts getDefaultSystemUser) once it has been bootstrapped.
  const defaultSystemUser = getRuntimeEnv("VITE_DEFAULT_SYSTEM_USER") === "1";
  const shouldLoadUser = auth.isAuthenticated || devAuthEnabled || defaultSystemUser;
  const userResult = useQuery(api.users.me, shouldLoadUser ? {} : "skip") as
    | Doc<"users">
    | null
    | undefined;
  const isUserLoading = shouldLoadUser && userResult === undefined;
  const me = shouldLoadUser ? userResult : auth.isLoading ? undefined : null;
  const hasActiveUser = Boolean(me);

  return {
    me,
    isAuthenticated: auth.isAuthenticated || hasActiveUser,
    isLoading: hasActiveUser ? false : auth.isLoading || isUserLoading,
  };
}
