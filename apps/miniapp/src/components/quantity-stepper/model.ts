export type QuantityChangeEvent = { quantity: number };

export type QuantityStepperController = {
  increment(quantity: number, disabled: boolean): void;
  decrement(quantity: number, disabled: boolean): void;
};

function isValidQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 99;
}

export function createQuantityStepperController(
  emit: (event: QuantityChangeEvent) => void,
): QuantityStepperController {
  function request(quantity: number, change: -1 | 1, disabled: boolean): void {
    if (disabled || !isValidQuantity(quantity)) return;
    const next = quantity + change;
    if (!isValidQuantity(next)) return;
    emit({ quantity: next });
  }

  return {
    increment: (quantity, disabled) => request(quantity, 1, disabled),
    decrement: (quantity, disabled) => request(quantity, -1, disabled),
  };
}
