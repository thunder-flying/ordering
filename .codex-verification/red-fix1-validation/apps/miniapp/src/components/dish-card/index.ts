type DishCardData = {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  priceText: string;
  favorited: boolean;
};

Component({
  properties: {
    dish: { type: Object, value: {} as DishCardData },
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
    handleFavorite() {
      const id = this.data.dish.id;
      if (id) this.triggerEvent("favoritechange", { id });
    },

    handleAdd() {
      const id = this.data.dish.id;
      if (id) this.triggerEvent("adddish", { id });
    },

    handleOpen() {
      const id = this.data.dish.id;
      if (id) this.triggerEvent("opendetail", { id });
    },

    handleImageError() {
      this.setData({ imageFailed: true });
    },
  },
});
