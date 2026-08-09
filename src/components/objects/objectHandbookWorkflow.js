import { base44 } from "@/api/base44Client";

export function listHandbookArticles(objectId) {
  return base44.entities.ObjectHandbookArticle.filter({ object_id: objectId, status: "active" }, "-updated_date", 250);
}

export function listHandbookCategories(objectId) {
  return base44.entities.ObjectHandbookCategory.filter({ object_id: objectId, status: "active" }, "name", 250);
}

export function createHandbookCategory(object, form) {
  return base44.entities.ObjectHandbookCategory.create({
    customer_id: object.customer_id,
    object_id: object.id,
    name: form.name.trim(),
    parent_category_id: form.parent_category_id || null,
    status: "active",
    version: 1,
  });
}

export function archiveHandbookCategory(category) {
  return base44.entities.ObjectHandbookCategory.update(category.id, {
    status: "archived",
    version: Number(category.version || 1) + 1,
  });
}

export function createHandbookArticle(object, form) {
  return base44.entities.ObjectHandbookArticle.create({
    customer_id: object.customer_id,
    object_id: object.id,
    category_id: form.category_id || null,
    title: form.title.trim(),
    content: form.content.trim(),
    status: "active",
    version: 1,
  });
}

export function updateHandbookArticle(article, form) {
  return base44.entities.ObjectHandbookArticle.update(article.id, {
    category_id: form.category_id || null,
    title: form.title.trim(),
    content: form.content.trim(),
    version: Number(article.version || 1) + 1,
  });
}

export function archiveHandbookArticle(article) {
  return base44.entities.ObjectHandbookArticle.update(article.id, {
    status: "archived",
    version: Number(article.version || 1) + 1,
  });
}