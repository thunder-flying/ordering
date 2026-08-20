export type TopDishStatDto = {
  dishId: string;
  dishName: string;
  favoriteCount: number;
};

export type AdminStatsDto = {
  userCount: number;
  activeUsers7d: number;
  favoriteCount: number;
  listCount: number;
  topDishes: TopDishStatDto[];
};
