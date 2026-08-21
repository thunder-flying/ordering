const LEGACY_SEED_CATEGORY_NAMES = new Set(["家常菜"]);

type SeedCategoryCandidate = {
  dishCount: number;
  id: string;
  name: string;
};

export function selectRetirableLegacyCategoryIds(
  categories: SeedCategoryCandidate[],
): string[] {
  return categories
    .filter(
      (category) =>
        category.dishCount === 0 &&
        LEGACY_SEED_CATEGORY_NAMES.has(category.name),
    )
    .map((category) => category.id);
}
