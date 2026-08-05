import { describe, expect, it } from "vitest";
import {
  AJAX_CONTROL_DEVICE_OPTIONS,
  AJAX_MANUAL_RELEASES,
  ajaxControlDevicePayload,
  resolveInstallationManual,
} from "@/components/objects/objectInstallationManuals";

describe("Ajax installation manuals", () => {
  it("koppelt ieder paneel aan een van vijf gedeelde, beschikbare handleidingfamilies", () => {
    const values = AJAX_CONTROL_DEVICE_OPTIONS.map(option => option.value);
    const manualKeys = AJAX_CONTROL_DEVICE_OPTIONS.map(option => option.manualKey);
    expect(new Set(values).size).toBe(values.length);
    expect(new Set(manualKeys).size).toBe(5);

    for (const option of AJAX_CONTROL_DEVICE_OPTIONS) {
      expect(option.sourceUrl).toMatch(/^https:\/\/support\.ajax\.systems\//);
      expect(AJAX_MANUAL_RELEASES[`${option.manualKey}@${option.manualVersion}`]).toMatchObject({
        version: option.manualVersion,
      });
    }
    expect(ajaxControlDevicePayload("keypad-jeweller").manual_key)
      .toBe(ajaxControlDevicePayload("superior-keypad-fibra").manual_key);
    expect(ajaxControlDevicePayload("keypad-touchscreen-jeweller").manual_key)
      .toBe(ajaxControlDevicePayload("superior-keypad-touchscreen-fibra").manual_key);
    expect(ajaxControlDevicePayload("keypad-combi-jeweller").manual_key)
      .toBe(ajaxControlDevicePayload("keypad-plus-jeweller").manual_key);
  });

  it("heeft voor ieder fysiek Ajax-paneel één lokale zwarte productfoto", () => {
    const physicalDevices = AJAX_CONTROL_DEVICE_OPTIONS.filter(option => option.value !== "ajax-app-only");
    expect(physicalDevices).toHaveLength(11);
    expect(physicalDevices.every(option => option.imageSrc === `/installation-control-devices/ajax/${option.value}.png`)).toBe(true);
    expect(AJAX_CONTROL_DEVICE_OPTIONS.find(option => option.value === "ajax-app-only")?.imageSrc).toBeNull();
  });

  it("lost uitsluitend de exact opgeslagen handleidingsversie op", () => {
    const selection = ajaxControlDevicePayload("keypad-touchscreen-jeweller");
    const installation = { installation_type: "alarm_system", brand: "Ajax Systems", ...selection };
    expect(resolveInstallationManual(installation)).toMatchObject({
      controlDevice: "KeyPad TouchScreen Jeweller",
      schematic: "touchscreen",
    });
    expect(resolveInstallationManual({ ...installation, manual_version: "999.0" })).toBeNull();
    expect(resolveInstallationManual({ ...installation, manual_key: "ajax:numeric-keypad:nl" })).toBeNull();
    expect(resolveInstallationManual({ ...installation, manual_key: null })).toBeNull();
    expect(resolveInstallationManual({ ...installation, manual_version: null })).toBeNull();
    expect(resolveInstallationManual({ ...installation, brand: "Honeywell" })).toBeNull();
  });

  it("houdt de eerste gepubliceerde release expliciet beschikbaar", () => {
    expect(AJAX_MANUAL_RELEASES["ajax:numeric-keypad:nl@2026.08.1"]).toMatchObject({
      version: "2026.08.1",
      reviewedOn: "2026-08-04",
    });
    expect(AJAX_MANUAL_RELEASES["ajax:touchscreen-keypad:nl@2026.08.1"]).toBeTruthy();
  });

  it("neemt sectiebediening en veilige eenmalige deactivering op zonder echte codes", () => {
    const selection = ajaxControlDevicePayload("keypad-jeweller");
    const manual = resolveInstallationManual({ installation_type: "alarm_system", brand: "Ajax", ...selection });
    expect(manual.procedures.some(procedure => procedure.key === "groups")).toBe(true);
    expect(manual.bypassProcedure.key).toBe("one-time-deactivation");
    expect(JSON.stringify(manual)).toContain("Schakelcode");
    expect(JSON.stringify(manual)).not.toContain("1234");
  });
});
