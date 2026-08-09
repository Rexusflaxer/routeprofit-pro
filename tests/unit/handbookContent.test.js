import { describe, expect, it } from "vitest";
import {
  articleOptionLabel,
  handbookArticleSearchText,
} from "@/components/objects/handbookContent";

const categories = [
  { id: "installations", name: "Installaties", parent_category_id: null },
  { id: "alarm", name: "Alarminstallatie", parent_category_id: "installations" },
  { id: "ajax-main", name: "Ajax hoofdcentrale", parent_category_id: "alarm" },
  { id: "ajax-warehouse", name: "Ajax magazijn", parent_category_id: "alarm" },
];

describe("handboekcontext", () => {
  it("indexeert de volledige categorie- en installatiecontext van een artikel", () => {
    const searchText = handbookArticleSearchText({
      id: "arm-main",
      category_id: "ajax-main",
      title: "Volledig inschakelen",
      summary: "Schakel alle groepen veilig in.",
      content_format: "blocks_v1",
      managed_blocks: [
        { id: "step", type: "steps", items: ["Voer uw code in", "Druk op Inschakelen"] },
      ],
      supplement_blocks: [],
    }, categories);

    expect(searchText).toContain("Installaties Alarminstallatie Ajax hoofdcentrale");
    expect(searchText).toContain("Volledig inschakelen");
    expect(searchText).toContain("Voer uw code in");
  });

  it("onderscheidt gelijknamige artikelen aan de hand van hun volledige categoriepad", () => {
    const mainLabel = articleOptionLabel(categories, {
      category_id: "ajax-main",
      title: "Volledig inschakelen",
    });
    const warehouseLabel = articleOptionLabel(categories, {
      category_id: "ajax-warehouse",
      title: "Volledig inschakelen",
    });

    expect(mainLabel).toBe("Installaties / Alarminstallatie / Ajax hoofdcentrale / Volledig inschakelen");
    expect(warehouseLabel).toBe("Installaties / Alarminstallatie / Ajax magazijn / Volledig inschakelen");
    expect(mainLabel).not.toBe(warehouseLabel);
  });
});
