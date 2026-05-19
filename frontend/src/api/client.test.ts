import { describe, expect, it } from "vitest";
import { ApiError } from "./client";

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
