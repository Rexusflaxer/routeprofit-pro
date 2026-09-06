import { describe, expect, it } from "vitest";
import { objectCoordinatePair, safeCoordinateNumber, trustedObjectCoordinatePair } from "../../src/lib/coordinates";

describe("coördinaatnormalisatie", () => {
  it("maakt van ontbrekende waarden nooit stilzwijgend Null Island", () => {
    [null, undefined, "", " ", false, [], {}].forEach(value => {
      expect(safeCoordinateNumber(value, -180, 180)).toBeNull();
    });
    expect(objectCoordinatePair({ latitude: null, longitude: null })).toBeNull();
    expect(objectCoordinatePair({ latitude: " ", longitude: "" })).toBeNull();
  });

  it("accepteert geldige getallen maar verwerpt alleen het exacte paar 0,0", () => {
    expect(objectCoordinatePair({ latitude: "52.44874121", longitude: "6.07245109" }))
      .toEqual([6.07245109, 52.44874121]);
    expect(safeCoordinateNumber(0, -180, 180)).toBe(0);
    expect(objectCoordinatePair({ latitude: 0, longitude: "0" })).toBeNull();
    expect(objectCoordinatePair({ latitude: 0, longitude: 6.1 })).toEqual([6.1, 0]);
    expect(objectCoordinatePair({ latitude: 52.4, longitude: 0 })).toEqual([0, 52.4]);
    expect(objectCoordinatePair({ latitude: 91, longitude: 4.9 })).toBeNull();
    expect(trustedObjectCoordinatePair({ latitude: 52.4, longitude: 6.1, geocoding_status: "unverified" })).toBeNull();
    expect(trustedObjectCoordinatePair({ latitude: 0, longitude: 0, geocoding_status: "manual" })).toBeNull();
  });
});
