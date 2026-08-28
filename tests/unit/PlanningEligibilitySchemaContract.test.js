import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function schema(name) {
  return JSON.parse(fs.readFileSync(path.join(root, "base44/entities", `${name}.jsonc`), "utf8"));
}

describe("planning eligibility schema contract", () => {
  it("houdt pasvereisten op diensten en objectdefaults gelijk aan PersonnelSecurityPass.pass_type", () => {
    const passTypes = schema("PersonnelSecurityPass").properties.pass_type.enum;
    const requirements = [
      schema("PlanningShift").properties.required_security_pass_types,
      schema("SurveillanceObject").properties.default_required_security_pass_types,
    ];

    for (const requirement of requirements) {
      expect(requirement).toMatchObject({
        type: "array",
        items: {
          type: "string",
          enum: passTypes,
        },
        default: [],
      });
    }
  });
});
