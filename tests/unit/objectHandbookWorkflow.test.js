import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMutation, invokeRead, createKey } = vi.hoisted(() => ({
  invokeMutation: vi.fn(),
  invokeRead: vi.fn(),
  createKey: vi.fn(action => `${action}:generated`),
}));

vi.mock("@/components/customers/customerDossierUtils", () => ({
  createCustomerMutationKey: createKey,
  invokeCustomerPlatformMutation: invokeMutation,
  invokeCustomerPlatformRead: invokeRead,
}));

import {
  archiveHandbookArticle,
  createHandbookArticle,
  createHandbookMutationKey,
  listObjectHandbook,
  syncInstallationHandbooks,
  updateHandbookArticle,
} from "@/components/objects/objectHandbookWorkflow";

describe("objectHandbookWorkflow", () => {
  beforeEach(() => {
    invokeMutation.mockReset();
    invokeRead.mockReset();
    createKey.mockClear();
  });

  it("leest het handboek uitsluitend binnen de gekozen klant en het object", async () => {
    invokeRead.mockResolvedValue({ categories: [], articles: [] });

    await listObjectHandbook({ customerId: "customer-1", objectId: "object-1" });

    expect(invokeRead).toHaveBeenCalledWith({
      action: "list_object_handbook",
      customer_id: "customer-1",
      object_id: "object-1",
    });
  });

  it("gebruikt expected_version 0 bij aanmaken en CAS bij wijzigen en archiveren", async () => {
    invokeMutation.mockResolvedValue({ article: { id: "article-1" } });
    const article = { id: "article-1", version: 7 };
    const form = {
      title: "Objectspecifieke openingsprocedure",
      supplement_blocks: [{ id: "intro", type: "paragraph", text: "Open via de receptie." }],
    };

    await createHandbookArticle({ customerId: "customer-1", objectId: "object-1", form, idempotencyKey: "create-key" });
    await updateHandbookArticle({ customerId: "customer-1", objectId: "object-1", article, form, idempotencyKey: "update-key" });
    await archiveHandbookArticle({ customerId: "customer-1", objectId: "object-1", article, idempotencyKey: "archive-key" });

    expect(invokeMutation).toHaveBeenNthCalledWith(1, {
      action: "create_object_handbook_article",
      idempotency_key: "create-key",
      expected_version: 0,
      customer_id: "customer-1",
      object_id: "object-1",
      data: form,
    });
    expect(invokeMutation).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: "update_object_handbook_article",
      article_id: "article-1",
      expected_version: 7,
    }));
    expect(invokeMutation).toHaveBeenNthCalledWith(3, expect.objectContaining({
      action: "archive_object_handbook_article",
      article_id: "article-1",
      expected_version: 7,
    }));
  });

  it("stuurt de serverberekende synchronisatietoken idempotent terug", async () => {
    invokeMutation.mockResolvedValue({ created_articles: 6 });

    expect(createHandbookMutationKey("create_object_handbook_article")).toBe("create_object_handbook_article:generated");
    await syncInstallationHandbooks({
      customerId: "customer-1",
      objectId: "object-1",
      syncToken: "sync-token-1",
      idempotencyKey: "sync-key-1",
    });

    expect(invokeMutation).toHaveBeenCalledWith({
      action: "sync_object_installation_handbooks",
      idempotency_key: "sync-key-1",
      expected_version: 0,
      customer_id: "customer-1",
      object_id: "object-1",
      sync_token: "sync-token-1",
    });
  });
});
