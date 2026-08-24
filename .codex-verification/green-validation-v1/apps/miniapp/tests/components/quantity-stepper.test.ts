import { describe, expect, it } from "vitest";

import { createQuantityStepperController } from "../../src/components/quantity-stepper/model";

describe("quantity-stepper controller", () => {
  it("emits integer quantity events for valid increments and decrements", () => {
    const events: Array<{ quantity: number }> = [];
    const stepper = createQuantityStepperController((event: { quantity: number }) => {
      events.push(event);
    });

    stepper.increment(1, false);
    stepper.decrement(99, false);

    expect(events).toEqual([{ quantity: 2 }, { quantity: 98 }]);
    expect(events.every((event) => Number.isInteger(event.quantity))).toBe(true);
  });

  it("does not cross the inclusive 1 through 99 boundaries", () => {
    const events: Array<{ quantity: number }> = [];
    const stepper = createQuantityStepperController((event: { quantity: number }) => {
      events.push(event);
    });

    stepper.decrement(1, false);
    stepper.increment(99, false);

    expect(events).toEqual([]);
  });

  it("does not emit from malformed non-integer quantities", () => {
    const events: Array<{ quantity: number }> = [];
    const stepper = createQuantityStepperController((event: { quantity: number }) => {
      events.push(event);
    });

    stepper.increment(1.5, false);
    stepper.decrement(Number.NaN, false);
    stepper.increment(100, false);
    stepper.decrement(0, false);

    expect(events).toEqual([]);
  });

  it("emits nothing while disabled", () => {
    const events: Array<{ quantity: number }> = [];
    const stepper = createQuantityStepperController((event: { quantity: number }) => {
      events.push(event);
    });

    stepper.increment(50, true);
    stepper.decrement(50, true);

    expect(events).toEqual([]);
  });
});
