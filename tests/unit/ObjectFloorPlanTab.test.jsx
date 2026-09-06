import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { filter } = vi.hoisted(() => ({ filter: vi.fn() }));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      ObjectFloorPlan: { filter },
    },
  },
}));

vi.mock("@/components/files/ManagedFilePreviewDialog", () => ({
  default: ({ open, managedFileId, fileUrl, title }) => open ? (
    <div role="dialog" data-managed-file-id={managedFileId || ""} data-file-url={fileUrl || ""}>
      {title}
    </div>
  ) : null,
}));

import ObjectFloorPlanTab from "@/components/objects/ObjectFloorPlanTab";
import { objectHasCoordinates } from "@/components/objects/objectDossierConfig";

describe("ObjectFloorPlanTab", () => {
  beforeEach(() => {
    filter.mockReset();
  });

  it("toont revisies en opent een ManagedFile-ID zonder de opgeslagen URL rechtstreeks te gebruiken", async () => {
    filter.mockResolvedValueOnce([
      {
        id: "plan-2",
        object_id: "object-1",
        revision: 2,
        title: "Begane grond",
        status: "published",
        is_current: true,
        source: "ios_roomplan",
        captured_at: "2026-07-30T10:00:00.000Z",
        published_at: "2026-07-31T10:00:00.000Z",
        preview_2d_file_id: "managed-preview-2",
        preview_2d_file_url: "https://storage.example/private-preview.png",
        preview_2d_download_filename: "begane-grond.png",
        annotations_json: { zones: [{ id: "gevoelige-zone" }], camera: [{ id: "camera-1" }] },
      },
      {
        id: "plan-1",
        object_id: "object-1",
        revision: 1,
        title: "Eerste opname",
        status: "archived",
        is_current: false,
      },
    ]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ObjectFloorPlanTab objectId="object-1" />
      </QueryClientProvider>,
    );

    const revisionTable = await screen.findByRole("table");
    const requestedFields = filter.mock.calls[0][4];
    expect(filter).toHaveBeenCalledWith({ object_id: "object-1" }, "-revision", 100, 0, expect.any(Array));
    expect(requestedFields).not.toContain("preview_2d_file_url");
    expect(requestedFields).not.toContain("usdz_file_url");
    expect(requestedFields).not.toContain("fallback_pdf_file_url");
    expect(requestedFields).not.toContain("raw_roomplan_file_url");
    expect(within(revisionTable).getByText("Eerste opname")).toBeInTheDocument();
    expect(requestedFields).not.toContain("annotations_json");
    expect(screen.queryByText("gevoelige-zone")).not.toBeInTheDocument();
    expect(document.querySelector("img[src='https://storage.example/private-preview.png']")).not.toBeInTheDocument();
    expect(document.querySelector("a[href='https://storage.example/private-preview.png']")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "2D-plattegrond van revisie 2 veilig bekijken" })[0]);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-managed-file-id", "managed-preview-2");
    expect(dialog).toHaveAttribute("data-file-url", "");
  });

  it("opent URL-only legacybestanden niet en vereist een veilige ManagedFile-koppeling", async () => {
    filter.mockResolvedValueOnce([{
      id: "legacy-plan",
      object_id: "object-1",
      revision: 1,
      status: "published",
      is_current: true,
      preview_2d_file_url: "https://storage.example/legacy-preview.png",
      fallback_pdf_file_url: "https://storage.example/legacy-floorplan.pdf",
    }]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ObjectFloorPlanTab objectId="object-1" />
      </QueryClientProvider>,
    );

    expect((await screen.findAllByText("ManagedFile-koppeling vereist")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /veilig bekijken/i })).not.toBeInTheDocument();
    expect(document.querySelector("a[href^='https://storage.example/']")).not.toBeInTheDocument();
  });
});

describe("objectHasCoordinates", () => {
  it("accepteert alleen werkelijk ingevulde coördinaten binnen hun bereik", () => {
    expect(objectHasCoordinates({ latitude: null, longitude: null })).toBe(false);
    expect(objectHasCoordinates({ latitude: undefined, longitude: undefined })).toBe(false);
    expect(objectHasCoordinates({ latitude: "", longitude: " " })).toBe(false);
    expect(objectHasCoordinates({ latitude: 91, longitude: 4.9 })).toBe(false);
    expect(objectHasCoordinates({ latitude: 52.37, longitude: 4.9 })).toBe(true);
    expect(objectHasCoordinates({ latitude: 0, longitude: 0 })).toBe(false);
    expect(objectHasCoordinates({ latitude: 0, longitude: 4.9 })).toBe(true);
    expect(objectHasCoordinates({ latitude: 52.37, longitude: 0 })).toBe(true);
  });
});
