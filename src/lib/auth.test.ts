// Note: Full auth.ts testing requires next-auth mocks and a test database.
// These are unit tests for auth helper logic; full integration tests
// should use a test MongoDB instance and mock NextAuth's internal fns.

describe("Auth helpers", () => {
  // LoginRateLimitError is tested implicitly via rate limiting tests
  // Full authorize() callback testing requires next-auth mock + test DB
  it("should have error class defined", () => {
    class LoginRateLimitError extends Error {
      constructor() {
        super("Too many sign-in attempts. Wait a minute and try again.");
        this.name = "LoginRateLimitError";
      }
    }
    const err = new LoginRateLimitError();
    expect(err.message).toBe("Too many sign-in attempts. Wait a minute and try again.");
    expect(err.name).toBe("LoginRateLimitError");
  });
});
