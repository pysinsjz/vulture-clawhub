import { useAuthActions } from "@convex-dev/auth/react";
import type { ComponentProps } from "react";
import { getUserFacingAuthError } from "../lib/authErrorMessage";
import { clearAuthError, setAuthError } from "../lib/useAuthError";
import { Button } from "./ui/button";

type ButtonProps = ComponentProps<typeof Button>;

type SignInButtonProps = Omit<ButtonProps, "onClick" | "type"> & {
  redirectTo?: string;
};

/**
 * Intranet sign-in: authenticates through the dev-persona credentials
 * provider (gateway-trust model). GitHub OAuth was removed with the
 * public marketplace.
 */
export function SignInButton({ children = "Sign In", ...props }: SignInButtonProps) {
  const { signIn } = useAuthActions();

  return (
    <Button
      {...props}
      type="button"
      variant="primary"
      onClick={() => {
        clearAuthError();
        void signIn("dev-persona", { persona: "admin" })
          .then((result) => {
            if (result?.signingIn === false && !result.redirect) {
              setAuthError("Sign in failed. Please try again.");
            }
          })
          .catch((error) => {
            setAuthError(getUserFacingAuthError(error, "Sign in failed. Please try again."));
          });
      }}
    >
      {children}
    </Button>
  );
}
