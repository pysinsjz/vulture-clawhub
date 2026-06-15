import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";
import { getRuntimeEnv } from "../lib/runtimeEnv";

/**
 * Internal-registry mode (VITE_DEFAULT_SYSTEM_USER=1): ensure the fixed "system"
 * user exists so the reactive UI (users.me → getDefaultSystemUser) resolves to
 * it without a login flow. No-op when the flag is off, so it stays inert on
 * authenticated deployments. Unlike UserBootstrap (which normalizes an
 * already-signed-in user), this creates the identity the UI defaults to.
 */
export function SystemUserBootstrap() {
  const enabled = getRuntimeEnv("VITE_DEFAULT_SYSTEM_USER") === "1";
  const ensureSystemUser = useMutation(api.users.ensureSystemUser);
  const didRun = useRef(false);

  useEffect(() => {
    if (!enabled || didRun.current) return;
    didRun.current = true;
    void ensureSystemUser({}).catch(() => {
      // Best-effort bootstrap; the UI stays usable even if it fails.
    });
  }, [enabled, ensureSystemUser]);

  return null;
}
