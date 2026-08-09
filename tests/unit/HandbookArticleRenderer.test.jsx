import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/managedFiles", () => ({
  prepareManagedFilePreview: vi.fn(),
  revokeManagedFilePreview: vi.fn(),
}));

import HandbookArticleRenderer from "@/components/objects/HandbookArticleRenderer";

const article = {
  id: "article-1",
  content_format: "blocks_v1",
  managed_blocks: [
    {
      id: "official-photo",
      type: "image",
      asset_key: "ajax:image:keypad:functional",
      managed_file_id: null,
      alt: "Officiële Ajax KeyPad met bedieningselementen",
      caption: "Controleer het paneel vóór gebruik.",
      layout: "contained",
    },
    {
      id: "arm-sequence",
      type: "button_sequence",
      sequence: [
        { type: "text", value: "Bevoegde code", label: null },
        { type: "icon", value: "ajax:icon:armed", label: "Inschakelen" },
      ],
    },
    {
      id: "article-link",
      type: "link",
      target_type: "article",
      target_id: "article-2",
      label: "Open uitschakelen",
      description: "Ga naar de afzonderlijke uitschakelprocedure.",
    },
  ],
  supplement_blocks: [
    { id: "local-note", type: "callout", tone: "warning", text: "Gebruik op dit object uitsluitend de receptie-ingang." },
    {
      id: "category-link",
      type: "link",
      target_type: "category",
      target_id: "category-2",
      label: "Open installatiecategorie",
      description: "Bekijk alle artikelen voor deze installatie.",
    },
  ],
};

describe("HandbookArticleRenderer", () => {
  it("rendert originele lokale Ajax-media, exacte pictogrammen en objectspecifieke aanvullingen", () => {
    const { container } = render(<HandbookArticleRenderer article={article} />);

    expect(screen.getByAltText("Officiële Ajax KeyPad met bedieningselementen")).toHaveAttribute(
      "src",
      "/installation-handbook-assets/ajax/2026.08.2/images/keypad-functional-elements.jpg",
    );
    expect(screen.getByText("Controleer het paneel vóór gebruik.")).toBeInTheDocument();
    expect(screen.getByLabelText("Toetsvolgorde")).toHaveTextContent("Bevoegde code");
    expect(screen.getByLabelText("Toetsvolgorde")).toHaveTextContent("Inschakelen");
    expect(container.querySelector('img[src="/installation-handbook-assets/ajax/2026.08.2/icons/armed.svg"]')).toBeInTheDocument();
    expect(screen.getByText("Gebruik op dit object uitsluitend de receptie-ingang.")).toBeInTheDocument();
  });

  it("opent alleen de gekozen interne artikel- of categorieverwijzing", () => {
    const onOpenArticle = vi.fn();
    const onOpenCategory = vi.fn();
    render(<HandbookArticleRenderer article={article} onOpenArticle={onOpenArticle} onOpenCategory={onOpenCategory} />);

    fireEvent.click(screen.getByRole("button", { name: /Open uitschakelen/i }));
    expect(onOpenArticle).toHaveBeenCalledWith("article-2");
    expect(onOpenCategory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Open installatiecategorie/i }));
    expect(onOpenCategory).toHaveBeenCalledWith("category-2");
  });

  it("rendert een onbekende asset fail-closed en gebruikt geen externe URL", () => {
    const { container } = render(<HandbookArticleRenderer article={{
      content_format: "blocks_v1",
      managed_blocks: [{
        id: "unknown",
        type: "image",
        asset_key: "https://example.invalid/tracker.png",
        alt: "Onbekende asset",
      }],
      supplement_blocks: [],
    }} />);

    expect(screen.getByText("Afbeelding ontbreekt.")).toBeInTheDocument();
    expect(container.querySelector('img[src^="https://example.invalid"]')).not.toBeInTheDocument();
  });
});
