import { beforeEach, describe, expect, it, vi } from "vitest";

async function readAppParams(path = "/Objects") {
  window.history.replaceState({}, "", path);
  vi.resetModules();
  return (await import("@/lib/app-params")).appParams;
}

describe("Base44 app parameters", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("neemt een functions_version uitsluitend uit de actuele preview-URL", async () => {
    const params = await readAppParams("/Objects?functions_version=preview-v2");

    expect(params.functionsVersion).toBe("preview-v2");
    expect(window.localStorage.getItem("base44_functions_version")).toBeNull();
  });

  it("hergebruikt geen functions_version uit een oudere preview", async () => {
    window.localStorage.setItem("base44_functions_version", "obsolete-preview-v1");

    const params = await readAppParams("/Objects");

    expect(params.functionsVersion).toBeNull();
  });
});
