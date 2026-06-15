/* @vitest-environment jsdom */

import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemUserBootstrap } from "./SystemUserBootstrap";

const ensureSystemUserMock = vi.fn();
const useMutationMock = vi.fn(() => ensureSystemUserMock);

vi.mock("convex/react", () => ({
  useMutation: () => useMutationMock(),
}));

const ENV = "VITE_DEFAULT_SYSTEM_USER";
const original = process.env[ENV];

describe("SystemUserBootstrap", () => {
  beforeEach(() => {
    ensureSystemUserMock.mockReset();
    ensureSystemUserMock.mockResolvedValue({ userId: "users:system" });
    useMutationMock.mockClear();
    delete process.env[ENV];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[ENV];
    else process.env[ENV] = original;
  });

  it("does not bootstrap when the flag is disabled", () => {
    render(<SystemUserBootstrap />);

    expect(ensureSystemUserMock).not.toHaveBeenCalled();
  });

  it("bootstraps the system user once when the flag is enabled", () => {
    process.env[ENV] = "1";

    const { rerender } = render(<SystemUserBootstrap />);
    rerender(<SystemUserBootstrap />);

    expect(ensureSystemUserMock).toHaveBeenCalledTimes(1);
    expect(ensureSystemUserMock).toHaveBeenCalledWith({});
  });
});
