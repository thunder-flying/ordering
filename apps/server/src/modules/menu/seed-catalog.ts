export type SeedDish = {
  assetFileName: string;
  description: string;
  name: string;
  priceCents: number;
};

export type SeedCategory = {
  dishes: SeedDish[];
  name: string;
  sortOrder: number;
};

export function validateSeedCatalog(categories: SeedCategory[]): void {
  const categoryNames = new Set<string>();
  const assetFileNames = new Set<string>();

  for (const [categoryIndex, category] of categories.entries()) {
    if (category.sortOrder !== categoryIndex + 1) {
      throw new Error("分类顺序必须从 1 开始连续递增");
    }
    if (categoryNames.has(category.name)) {
      throw new Error("分类名称不能重复");
    }
    categoryNames.add(category.name);

    const dishNames = new Set<string>();
    for (const dish of category.dishes) {
      if (dishNames.has(dish.name)) {
        throw new Error("同一分类下的菜品名称不能重复");
      }
      dishNames.add(dish.name);

      if (assetFileNames.has(dish.assetFileName)) {
        throw new Error("菜品图片文件名不能重复");
      }
      assetFileNames.add(dish.assetFileName);

      if (!/^[a-z0-9-]+\.webp$/.test(dish.assetFileName)) {
        throw new Error("菜品图片必须使用小写短横线命名的 WebP 文件");
      }
      if (!Number.isInteger(dish.priceCents) || dish.priceCents < 0) {
        throw new Error("菜品参考价格必须是非负整数分值");
      }
    }
  }
}

export const PUBLIC_MENU_SEED: SeedCategory[] = [
  {
    name: "家常热菜",
    sortOrder: 1,
    dishes: [
      { name: "番茄炒蛋", description: "软嫩鸡蛋裹着酸甜番茄汁，是很下饭的家常味道。", priceCents: 1_280, assetFileName: "tomato-scrambled-eggs.webp" },
      { name: "鱼香肉丝", description: "肉丝配木耳和笋丝快炒，咸甜微辣，鱼香味浓郁。", priceCents: 2_280, assetFileName: "yu-shiang-pork.webp" },
      { name: "宫保鸡丁", description: "嫩鸡丁搭配花生与干辣椒，酸甜微辣、口感丰富。", priceCents: 2_380, assetFileName: "kung-pao-chicken.webp" },
      { name: "麻婆豆腐", description: "嫩豆腐配牛肉末和花椒，麻辣鲜香，汤汁浓郁。", priceCents: 1_380, assetFileName: "mapo-tofu.webp" },
    ],
  },
  {
    name: "肉禽",
    sortOrder: 2,
    dishes: [
      { name: "红烧肉", description: "五花肉慢火烧至酥软，色泽红亮，咸甜适口。", priceCents: 3_280, assetFileName: "braised-pork-belly.webp" },
      { name: "土豆烧牛腩", description: "牛腩炖得软烂入味，土豆吸满醇厚汤汁。", priceCents: 3_680, assetFileName: "beef-brisket-potato.webp" },
      { name: "葱油鸡", description: "鸡肉鲜嫩多汁，淋上热葱油，葱香清鲜。", priceCents: 2_880, assetFileName: "scallion-oil-chicken.webp" },
      { name: "京酱肉丝", description: "猪里脊切丝滑炒，甜面酱浓香，搭配葱丝食用。", priceCents: 2_580, assetFileName: "beijing-sauce-pork.webp" },
    ],
  },
  {
    name: "水产",
    sortOrder: 3,
    dishes: [
      { name: "清蒸鲈鱼", description: "鲜鲈鱼清蒸锁住原味，配葱姜和蒸鱼豉油。", priceCents: 4_680, assetFileName: "steamed-sea-bass.webp" },
      { name: "香辣虾", description: "鲜虾与辣椒、香料煸炒，外壳酥香，香辣过瘾。", priceCents: 4_280, assetFileName: "spicy-shrimp.webp" },
      { name: "蒜蓉粉丝扇贝", description: "扇贝铺上粉丝和金蒜蒸制，鲜甜中带着蒜香。", priceCents: 3_980, assetFileName: "garlic-vermicelli-scallops.webp" },
      { name: "酸菜鱼", description: "鱼片滑嫩，酸菜爽脆，汤底酸辣开胃。", priceCents: 4_580, assetFileName: "sauerkraut-fish.webp" },
    ],
  },
  {
    name: "时蔬",
    sortOrder: 4,
    dishes: [
      { name: "蒜蓉生菜", description: "新鲜生菜大火快炒，保留清脆口感和浓郁蒜香。", priceCents: 1_280, assetFileName: "garlic-lettuce.webp" },
      { name: "干煸四季豆", description: "四季豆煸至微皱，配肉末和芽菜，干香微辣。", priceCents: 1_880, assetFileName: "dry-fried-green-beans.webp" },
      { name: "地三鲜", description: "茄子、土豆和青椒烧制，软糯鲜香，酱汁入味。", priceCents: 1_680, assetFileName: "di-san-xian.webp" },
      { name: "荷塘小炒", description: "莲藕、荷兰豆、木耳与胡萝卜清炒，爽脆清新。", priceCents: 1_980, assetFileName: "lotus-pond-stir-fry.webp" },
    ],
  },
  {
    name: "汤羹",
    sortOrder: 5,
    dishes: [
      { name: "玉米排骨汤", description: "排骨与甜玉米慢炖，汤色清亮，味道温润鲜甜。", priceCents: 2_680, assetFileName: "corn-pork-rib-soup.webp" },
      { name: "冬瓜丸子汤", description: "手打肉丸配清甜冬瓜，汤鲜不腻。", priceCents: 2_280, assetFileName: "winter-melon-meatball-soup.webp" },
      { name: "西湖牛肉羹", description: "牛肉末、香菇与蛋花调成细滑羹汤，鲜香暖胃。", priceCents: 2_380, assetFileName: "west-lake-beef-soup.webp" },
      { name: "紫菜蛋花汤", description: "紫菜搭配轻盈蛋花，清爽鲜美。", priceCents: 980, assetFileName: "seaweed-egg-drop-soup.webp" },
    ],
  },
  {
    name: "主食",
    sortOrder: 6,
    dishes: [
      { name: "扬州炒饭", description: "米饭粒粒分明，配鸡蛋、虾仁、火腿和时蔬。", priceCents: 1_680, assetFileName: "yangzhou-fried-rice.webp" },
      { name: "牛肉炒面", description: "劲道面条配牛肉片和蔬菜大火炒香。", priceCents: 1_980, assetFileName: "beef-chow-mein.webp" },
      { name: "鲜肉小馄饨", description: "薄皮鲜肉馄饨配清汤、紫菜和葱花。", priceCents: 1_580, assetFileName: "pork-wonton-soup.webp" },
      { name: "葱油拌面", description: "细面拌入焦香葱油和酱汁，简单却有层次。", priceCents: 1_280, assetFileName: "scallion-oil-noodles.webp" },
    ],
  },
  {
    name: "增肌健身餐",
    sortOrder: 7,
    dishes: [
      { name: "黑椒牛肉糙米增肌餐", description: "约 700 千卡，蛋白质约 40 克；瘦牛肉搭配糙米、西兰花和彩椒。", priceCents: 3_980, assetFileName: "black-pepper-beef-brown-rice.webp" },
      { name: "香煎鸡腿红薯能量餐", description: "约 680 千卡，蛋白质约 38 克；去皮鸡腿搭配烤红薯、玉米和时蔬。", priceCents: 3_580, assetFileName: "pan-seared-chicken-sweet-potato.webp" },
      { name: "三文鱼藜麦增肌碗", description: "约 720 千卡，蛋白质约 39 克；三文鱼搭配藜麦、鹰嘴豆和混合蔬菜。", priceCents: 4_580, assetFileName: "salmon-quinoa-muscle-bowl.webp" },
      { name: "鸡胸双蛋全麦意面", description: "约 740 千卡，蛋白质约 40 克；鸡胸肉、鸡蛋与全麦意面组成训练能量餐。", priceCents: 3_880, assetFileName: "chicken-egg-wholewheat-pasta.webp" },
    ],
  },
  {
    name: "减脂健身餐",
    sortOrder: 8,
    dishes: [
      { name: "香草鸡胸南瓜减脂餐", description: "约 450 千卡，蛋白质约 38 克；香草鸡胸搭配南瓜、西兰花和生菜。", priceCents: 3_280, assetFileName: "herb-chicken-pumpkin-cut.webp" },
      { name: "虾仁西兰花藜麦碗", description: "约 430 千卡，蛋白质约 35 克；虾仁搭配藜麦、西兰花和小番茄。", priceCents: 3_680, assetFileName: "shrimp-broccoli-quinoa.webp" },
      { name: "清蒸鲈鱼杂粮蔬菜餐", description: "约 460 千卡，蛋白质约 36 克；清蒸鲈鱼配杂粮饭和清爽时蔬。", priceCents: 3_980, assetFileName: "steamed-bass-multigrain.webp" },
      { name: "黑椒牛肉魔芋面", description: "约 420 千卡，蛋白质约 38 克；瘦牛肉搭配魔芋面、彩椒和菌菇。", priceCents: 3_580, assetFileName: "pepper-beef-konjac-noodles.webp" },
    ],
  },
  {
    name: "体型维持餐",
    sortOrder: 9,
    dishes: [
      { name: "照烧鸡胸杂粮饭", description: "约 580 千卡，蛋白质约 36 克；少糖照烧鸡胸搭配杂粮饭和西兰花。", priceCents: 3_480, assetFileName: "teriyaki-chicken-mixed-grain.webp" },
      { name: "番茄牛肉全麦意面", description: "约 600 千卡，蛋白质约 35 克；瘦牛肉番茄酱搭配全麦意面和时蔬。", priceCents: 3_680, assetFileName: "tomato-beef-wholewheat-pasta.webp" },
      { name: "三文鱼时蔬糙米碗", description: "约 620 千卡，蛋白质约 34 克；三文鱼搭配糙米、牛油果和混合时蔬。", priceCents: 4_380, assetFileName: "salmon-vegetable-brown-rice.webp" },
      { name: "豆腐鸡蛋菌菇杂粮餐", description: "约 540 千卡，蛋白质约 30 克；豆腐、鸡蛋和菌菇搭配杂粮饭与青菜。", priceCents: 2_980, assetFileName: "tofu-egg-mushroom-grain.webp" },
    ],
  },
];

validateSeedCatalog(PUBLIC_MENU_SEED);
