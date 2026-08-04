import { describe, expect, it } from "vitest";
import {
  ALARM_SYSTEM_BRAND_OPTIONS,
  INSTALLATION_BRANDS,
  filterInstallationBrandOptions,
  findInstallationBrandOption,
} from "@/components/objects/objectInstallationConfig";

describe("alarm installation brand catalogue", () => {
  it("uses unique canonical brand names and a local PNG for every option", () => {
    const values = ALARM_SYSTEM_BRAND_OPTIONS.map(option => option.value);
    const logos = ALARM_SYSTEM_BRAND_OPTIONS.map(option => option.logoSrc);

    expect(ALARM_SYSTEM_BRAND_OPTIONS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(values).size).toBe(values.length);
    expect(new Set(logos).size).toBe(logos.length);
    expect(logos.every(source => /^\/installation-brand-logos\/alarm-system\/[a-z0-9-]+\.png$/.test(source))).toBe(true);
    expect(INSTALLATION_BRANDS.alarm_system).toEqual(values);
  });

  it("stores brands instead of product families", () => {
    const values = ALARM_SYSTEM_BRAND_OPTIONS.map(option => option.value);

    expect(values).toContain("Ajax Systems");
    expect(values).toContain("UNii");
    expect(values).toContain("Aritech");
    expect(values).toContain("Honeywell");
    expect(values).not.toContain("Ajax");
    expect(values).not.toContain("Alphatronics UNii");
    expect(values).not.toContain("Aritech ATS");
    expect(values).not.toContain("Honeywell Galaxy");
  });

  it("recognises existing values through exact compatibility aliases", () => {
    expect(findInstallationBrandOption("alarm_system", " Ajax ")?.value).toBe("Ajax Systems");
    expect(findInstallationBrandOption("alarm_system", "Alphatronics UNii")?.value).toBe("UNii");
    expect(findInstallationBrandOption("alarm_system", "Aritech ATS")?.value).toBe("Aritech");
    expect(findInstallationBrandOption("alarm_system", "Honeywell Galaxy")?.value).toBe("Honeywell");
    expect(findInstallationBrandOption("alarm_system", "Onbekend merk")).toBeNull();
  });

  it("has no normalised canonical or alias collisions between brands", () => {
    const owners = new Map();
    const normalize = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("nl-NL");

    for (const option of ALARM_SYSTEM_BRAND_OPTIONS) {
      for (const candidate of [option.value, ...option.aliases]) {
        const key = normalize(candidate);
        const existingOwner = owners.get(key);
        expect(existingOwner === undefined || existingOwner === option.value, `${candidate} is claimed by multiple brands`).toBe(true);
        owners.set(key, option.value);
      }
    }
  });

  it("finds a brand by product family without changing the stored value", () => {
    expect(filterInstallationBrandOptions("alarm_system", "Galaxy").map(option => option.value)).toEqual(["Honeywell"]);
    expect(filterInstallationBrandOptions("alarm_system", "ATS").map(option => option.value)).toEqual(["Aritech"]);
    expect(filterInstallationBrandOptions("alarm_system", "AlphaVision").map(option => option.value)).toEqual(["Alphatronics"]);
    expect(filterInstallationBrandOptions("alarm_system", "SPC").map(option => option.value)).toEqual(["acre Security", "Vanderbilt"]);
  });
});
