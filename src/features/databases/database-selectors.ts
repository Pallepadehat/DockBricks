import type { Category, ContainerEngine, Database } from "@/types/models";

export function getEngineDatabases(
  databases: Database[],
  selectedEngine: ContainerEngine,
): Database[] {
  return databases.filter((db) => !db.engine || db.engine === selectedEngine);
}

export function getVisibleDatabases(
  databases: Database[],
  selectedEngine: ContainerEngine,
  selectedCategory: string | null,
): Database[] {
  const engineDatabases = getEngineDatabases(databases, selectedEngine);
  if (selectedCategory === null) return engineDatabases;
  return engineDatabases.filter((db) => db.categoryIds.includes(selectedCategory));
}

export function getSelectedCategoryName(
  categories: Category[],
  selectedCategory: string | null,
): string {
  if (selectedCategory === null) return "All";
  return categories.find((category) => category.id === selectedCategory)?.name ?? "All";
}

export function getCategoryNameById(categories: Category[]): Record<string, string> {
  return categories.reduce<Record<string, string>>((acc, category) => {
    acc[category.id] = category.name;
    return acc;
  }, {});
}

export function getDatabaseCategoryNames(
  db: Database,
  categoryNameById: Record<string, string>,
): string[] {
  return db.categoryIds
    .map((categoryId) => categoryNameById[categoryId])
    .filter((categoryName): categoryName is string => Boolean(categoryName));
}
