# 公共菜单模拟数据

种子包含 9 个公共分类、36 道已上架菜品和 36 张对应的 WebP 图片。图片源文件位于 `seed-assets/dishes`。

分类排序使用整数 `1` 到 `9`（界面可显示为 `01` 到 `09`），依次为：家常热菜、肉禽、水产、时蔬、汤羹、主食、增肌健身餐、减脂健身餐、体型维持餐。旧版遗留的空分类“家常菜”会在播种时删除；若该分类已有菜品，脚本会保留它以避免误删业务数据。

运行前需在 `apps/server/.env` 中正确配置 `DATABASE_URL` 和 `UPLOAD_ROOT`，然后从仓库根目录执行：

```powershell
pnpm --filter @ordering/server prisma:seed
```

脚本会把图片复制到 `UPLOAD_ROOT/dishes`，创建或更新 `Upload`、`Category` 和 `Dish` 记录。分类按名称匹配，菜品按“分类 + 名称”匹配；重复执行会更新这套菜单，不会清空或重复创建项目中的其他数据。
