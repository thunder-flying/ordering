import { createQuantityStepperController } from "./model";

type Controller = ReturnType<typeof createQuantityStepperController>;
const controllers = new WeakMap<object, Controller>();

function controllerFor(component: object & { triggerEvent(name: string, detail: { quantity: number }): void }): Controller {
  let controller = controllers.get(component);
  if (!controller) {
    controller = createQuantityStepperController((detail) => {
      component.triggerEvent("change", detail);
    });
    controllers.set(component, controller);
  }
  return controller;
}

Component({
  properties: {
    quantity: { type: Number, value: 1 },
    disabled: { type: Boolean, value: false },
  },

  lifetimes: {
    attached() {
      controllerFor(this);
    },
    detached() {
      controllers.delete(this);
    },
  },

  methods: {
    handleDecrement() {
      controllerFor(this).decrement(this.data.quantity, this.data.disabled);
    },
    handleIncrement() {
      controllerFor(this).increment(this.data.quantity, this.data.disabled);
    },
  },
});
