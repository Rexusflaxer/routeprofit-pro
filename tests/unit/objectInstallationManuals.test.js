import { describe, expect, it } from "vitest";
import {
  AJAX_CONTROL_DEVICE_OPTIONS,
  AJAX_CONTROL_DEVICE_VARIANTS,
  AJAX_MANUAL_RELEASES,
  AJAX_MANUAL_VERSION,
  ajaxControlDevicePayload,
  findAjaxControlDevice,
  findAjaxControlDeviceVariant,
  resolveInstallationManual,
} from "@/components/objects/objectInstallationManuals";

describe("Ajax installation manuals", () => {
  it("toont alleen de zes unieke bedieningswijzen in plaats van aansluitvarianten", () => {
    const values = AJAX_CONTROL_DEVICE_OPTIONS.map(option => option.value);
    const manualKeys = AJAX_CONTROL_DEVICE_OPTIONS.map(option => option.manualKey);
    expect(values).toEqual([
      "keypad",
      "keypad-plus",
      "keypad-combi",
      "keypad-touchscreen",
      "keypad-outdoor",
      "ajax-app-only",
    ]);
    expect(new Set(manualKeys).size).toBe(6);

    for (const option of AJAX_CONTROL_DEVICE_OPTIONS) {
      expect(option.sourceUrl).toMatch(/^https:\/\/support\.ajax\.systems\//);
      expect(AJAX_MANUAL_RELEASES[`${option.manualKey}@${option.manualVersion}`]).toMatchObject({
        version: option.manualVersion,
      });
    }

    const visibleCopy = AJAX_CONTROL_DEVICE_OPTIONS
      .map(option => [option.label, option.description, option.operationLabel].join(" "))
      .join(" ");
    expect(visibleCopy).not.toMatch(/Jeweller|Fibra|Grade 3|draadloos|bedraad/i);
  });

  it("heeft voor ieder zichtbaar fysiek bedieningstype één lokale productfoto", () => {
    const physicalDevices = AJAX_CONTROL_DEVICE_OPTIONS.filter(option => option.value !== "ajax-app-only");
    expect(physicalDevices).toHaveLength(5);
    expect(physicalDevices.every(option => option.imageSrc === `/installation-control-devices/ajax/${option.value}.png`)).toBe(true);
    expect(physicalDevices.every(option => option.imageScale >= 1.4 && option.imageScale <= 1.9)).toBe(true);
    expect(AJAX_CONTROL_DEVICE_OPTIONS.find(option => option.value === "ajax-app-only")?.imageSrc).toBeNull();
  });

  it("blijft alle exact opgeslagen hardwarevarianten aan hun bedieningswijze koppelen", () => {
    const expectedOptionByVariant = {
      "keypad-jeweller": "keypad",
      "superior-keypad-fibra": "keypad",
      "keypad-plus-jeweller": "keypad-plus",
      "superior-keypad-plus-jeweller": "keypad-plus",
      "superior-keypad-plus-g3-jeweller": "keypad-plus",
      "keypad-combi-jeweller": "keypad-combi",
      "keypad-touchscreen-jeweller": "keypad-touchscreen",
      "superior-keypad-touchscreen-fibra": "keypad-touchscreen",
      "superior-keypad-touchscreen-g3-jeweller": "keypad-touchscreen",
      "keypad-outdoor-jeweller": "keypad-outdoor",
      "superior-keypad-outdoor-fibra": "keypad-outdoor",
    };

    expect(AJAX_CONTROL_DEVICE_VARIANTS).toHaveLength(Object.keys(expectedOptionByVariant).length);
    for (const variant of AJAX_CONTROL_DEVICE_VARIANTS) {
      const option = findAjaxControlDevice(variant.value);
      expect(findAjaxControlDeviceVariant(variant.value)).toEqual(variant);
      expect(option?.value).toBe(expectedOptionByVariant[variant.value]);
      expect(ajaxControlDevicePayload(variant.value)).toMatchObject({
        control_device_key: variant.value,
        control_device_name: variant.label,
        manual_key: variant.manualKey || option.manualKey,
      });
    }
  });

  it("deelt handleidingen bij gelijke bediening en houdt Combi apart vanwege de zoemer", () => {
    const payload = value => ajaxControlDevicePayload(value);

    expect(payload("keypad").manual_key).toBe(payload("keypad-jeweller").manual_key);
    expect(payload("keypad").manual_key).toBe(payload("superior-keypad-fibra").manual_key);
    expect(payload("keypad-plus").manual_key).toBe(payload("keypad-plus-jeweller").manual_key);
    expect(payload("keypad-plus").manual_key).toBe(payload("superior-keypad-plus-g3-jeweller").manual_key);
    expect(payload("keypad-touchscreen").manual_key).toBe(payload("superior-keypad-touchscreen-fibra").manual_key);
    expect(payload("keypad-outdoor").manual_key).toBe(payload("superior-keypad-outdoor-fibra").manual_key);

    expect(payload("keypad-combi").manual_key).toBe("ajax:numeric-reader-buzzer-keypad:nl");
    expect(payload("keypad-combi").manual_key).not.toBe(payload("keypad-plus").manual_key);
    expect(payload("keypad-combi-jeweller").manual_key).toBe(payload("keypad-combi").manual_key);
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

  it("houdt de eerste release beschikbaar en publiceert 2026.08.2 als actuele release", () => {
    expect(AJAX_MANUAL_VERSION).toBe("2026.08.2");
    expect(AJAX_MANUAL_RELEASES["ajax:numeric-keypad:nl@2026.08.1"]).toMatchObject({
      version: "2026.08.1",
      reviewedOn: "2026-08-04",
    });
    expect(AJAX_MANUAL_RELEASES["ajax:numeric-reader-buzzer-keypad:nl@2026.08.1"]).toMatchObject({
      schematic: "numeric-reader",
      intro: expect.stringContaining("ingebouwde zoemer"),
    });
    expect(AJAX_MANUAL_RELEASES["ajax:touchscreen-keypad:nl@2026.08.1"]).toBeTruthy();
    expect(AJAX_MANUAL_RELEASES["ajax:numeric-keypad:nl@2026.08.2"]).toMatchObject({
      version: "2026.08.2",
      reviewedOn: "2026-08-09",
    });
    expect(AJAX_MANUAL_RELEASES["ajax:numeric-reader-buzzer-keypad:nl@2026.08.2"]).toMatchObject({
      intro: expect.stringContaining("ingebouwde zoemer"),
    });
  });

  it("leest een oude Combi-koppeling reproduceerbaar en gebruikt voor nieuwe opslag de zoemerfamilie", () => {
    const legacy = {
      installation_type: "alarm_system",
      brand: "Ajax Systems",
      control_device_key: "keypad-combi-jeweller",
      manual_key: "ajax:numeric-reader-keypad:nl",
      manual_version: "2026.08.1",
    };
    expect(resolveInstallationManual(legacy)).toMatchObject({
      version: "2026.08.1",
      controlDevice: "KeyPad Combi Jeweller",
    });

    const current = { ...legacy, ...ajaxControlDevicePayload("keypad-combi-jeweller") };
    expect(current).toMatchObject({
      manual_key: "ajax:numeric-reader-buzzer-keypad:nl",
      manual_version: "2026.08.2",
    });
    expect(resolveInstallationManual(current)).toMatchObject({ version: "2026.08.2" });
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
