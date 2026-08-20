import { route } from "../../../../lib/http/handler";
import { listPublicCategories } from "../../../../modules/menu/menu-query";

export const GET = route(async () => ({
  items: await listPublicCategories(),
}));
