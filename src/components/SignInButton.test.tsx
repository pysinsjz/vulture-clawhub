/* @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignInButton } from "./SignInButton";

const signInMock = vi.fn();
const clearAuthErrorMock = vi.fn();
const setAuthErrorMock = vi.fn();
const getUserFacingAuthErrorMock = vi.fn();

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({
    signIn: signInMock,
  }),
}));

vi.mock("../lib/useAuthError", () => ({
  clearAuthError: () => clearAuthErrorMock(),
  setAuthError: (message: string) => setAuthErrorMock(message),
}));

vi.mock("../lib/authErrorMessage", () => ({
  getUserFacingAuthError: (error: unknown, fallback: string) =>
    getUserFacingAuthErrorMock(error, fallback),
}));

describe("SignInButton", () => {
  beforeEach(() => {
    signInMock.mockReset();
    clearAuthErrorMock.mockReset();
    setAuthErrorMock.mockReset();
    getUserFacingAuthErrorMock.mockReset();
    getUserFacingAuthErrorMock.mockImplementation((_, fallback) => fallback);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("signs in through the dev-persona credentials provider", async () => {
    signInMock.mockResolvedValue({ signingIn: true });

    render(<SignInButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("dev-persona", { persona: "admin" });
    });
    expect(clearAuthErrorMock).toHaveBeenCalledTimes(1);
    expect(setAuthErrorMock).not.toHaveBeenCalled();
  });

  it("surfaces a generic error when sign-in resolves without a session", async () => {
    signInMock.mockResolvedValue({ signingIn: false });

    render(<SignInButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(setAuthErrorMock).toHaveBeenCalledWith("Sign in failed. Please try again.");
    });
  });

  it("surfaces user-facing auth errors when sign-in rejects", async () => {
    const failure = new Error("credentials rejected");
    signInMock.mockRejectedValue(failure);
    getUserFacingAuthErrorMock.mockReturnValue("Intranet auth unavailable");

    render(<SignInButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(getUserFacingAuthErrorMock).toHaveBeenCalledWith(
        failure,
        "Sign in failed. Please try again.",
      );
      expect(setAuthErrorMock).toHaveBeenCalledWith("Intranet auth unavailable");
    });
  });
});
