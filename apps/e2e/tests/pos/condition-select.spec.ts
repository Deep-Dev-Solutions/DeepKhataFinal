import { test } from '@playwright/test';

// Known feature gap, not a bug: conditions live on product instances and the POS picks instances automatically,
// so there is no UI to choose a condition (ORIGINAL_PULL / MINOR_SCRATCHES ...) when adding an item to the cart.
test.fixme('cashier can choose the item condition when adding a product to the cart', async () => {
  // Intentionally empty until the POS exposes condition selection.
});
