import type { DishCardView } from "../../pages/select/model";

Component({
  properties: {
    dish: { type: Object, value: null },
    favoritePending: { type: Boolean, value: false },
  },

  data: {
    imageFailed: false,
  },

  observers: {
    dish() {
      this.setData({ imageFailed: false });
    },
  },

  methods: {
    dishId(): string | undefined {
      return (this.data.dish as DishCardView | null)?.id;
    },

    handleFavorite() {
      const id = this.dishId();
      if (id) this.triggerEvent("favoritechange", { id });
    },

    handleAdd() {
      const id = this.dishId();
      if (id) this.triggerEvent("adddish", { id });
    },

    handleOpen() {
      const id = this.dishId();
      if (id) this.triggerEvent("opendetail", { id });
    },

    handleImageError() {
      this.setData({ imageFailed: true });
    },
  },
});
