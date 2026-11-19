import { viewerMayCallApi } from "@/lib/viewerAccess";
import { isReadOnlyRole } from "@/lib/enums";

describe("viewerMayCallApi", () => {
  it("allows reads", () => {
    expect(viewerMayCallApi("GET", "/api/items/abc/changes")).toBe(true);
    expect(viewerMayCallApi("get", "/api/monday/files/1")).toBe(true);
  });
  it("refuses every write to app data, whatever the method", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      for (const p of [
        "/api/items/abc",
        "/api/items/abc/media/confirm",
        "/api/catalog",
        "/api/catalog/abc/approve",
        "/api/purchase-orders/abc",
        "/api/quotations/abc/commit",
        "/api/images/check",
        "/api/admin/users",
        "/api/admin/users/abc",
        "/api/monday/sync",
        "/api/catalog/export",
        "/api/jobs/tick",
      ]) {
        expect(viewerMayCallApi(m, p)).toBe(false);
      }
    }
  });
  it("does not let a look-alike prefix through", () => {
    expect(viewerMayCallApi("POST", "/api/users/mea")).toBe(false);
    expect(viewerMayCallApi("POST", "/api/users")).toBe(false);
    expect(viewerMayCallApi("POST", "/api/supporter")).toBe(false);
    expect(viewerMayCallApi("POST", "/api/authx/y")).toBe(false);
  });
  it("allows writes to the person's own account and sign-in", () => {
    expect(viewerMayCallApi("POST", "/api/users/me/password")).toBe(true);
    expect(viewerMayCallApi("POST", "/api/auth/callback/credentials")).toBe(true);
    expect(viewerMayCallApi("POST", "/api/support")).toBe(true);
  });
});

describe("isReadOnlyRole", () => {
  it("is only the viewer", () => {
    expect(isReadOnlyRole("viewer")).toBe(true);
    expect(isReadOnlyRole("administrator")).toBe(false);
    expect(isReadOnlyRole(undefined)).toBe(false);
  });
});
