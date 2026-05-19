import { describe, expect, it } from "vitest";
import { ApiError, isBackendUnreachableError } from "./client";

// Human: Smoke-test the shared API error type used across pages.
// Agent: ApiError CARRIES status + message from JSON envelope.
describe("ApiError", () => {
  it("exposes status and message", () => {
    const err = new ApiError({
      message: "not found",
      status: 404,
      path: "/api/v1/songs",
      rawBody: "",
    });
    expect(err.message).toBe("not found");
    expect(err.status).toBe(404);
    expect(err.name).toBe("ApiError");
  });
});

// Human: SetupGuard treats network and gateway failures differently from ordinary HTTP app errors.
// Agent: isBackendUnreachableError TRUE for status 0/502/503/504 only.
describe("isBackendUnreachableError", () => {
  it("detects network and gateway failures", () => {
    expect(isBackendUnreachableError(new ApiError({ message: "network", status: 0, path: "/setup/status", rawBody: "" }))).toBe(true);
    expect(isBackendUnreachableError(new ApiError({ message: "bad gateway", status: 502, path: "/setup/status", rawBody: "" }))).toBe(true);
    expect(isBackendUnreachableError(new ApiError({ message: "unavailable", status: 503, path: "/setup/status", rawBody: "" }))).toBe(true);
    expect(isBackendUnreachableError(new ApiError({ message: "timeout", status: 504, path: "/setup/status", rawBody: "" }))).toBe(true);
  });

  it("ignores ordinary HTTP errors", () => {
    expect(isBackendUnreachableError(new ApiError({ message: "not found", status: 404, path: "/setup/status", rawBody: "" }))).toBe(false);
    expect(isBackendUnreachableError(new ApiError({ message: "server error", status: 500, path: "/setup/status", rawBody: "" }))).toBe(false);
    expect(isBackendUnreachableError(new Error("network"))).toBe(false);
  });
});
