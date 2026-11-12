import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import {
  HALL_ROAD,
  addToCart,
  createCustomer,
  createProduct,
  createSaleViaApi,
  customerOutstanding,
  openCheckout,
  pickExistingCustomer,
} from './support';

test.use({ storageState: storage('ownerA') });

test('checkout shows the selected customer’s live udhar', async ({ page, request }) => {
  const customer = await createCustomer(request, 'UdharBadge');
  const oldSale = await createProduct(request, { price: 100000, qty: 1, label: 'UdharBadge' });
  const cartItem = await createProduct(request, { price: 500, qty: 1, label: 'UdharBadge' });

  await createSaleViaApi(request, {
    items: [{ productId: oldSale.id, quantity: 1, price: 100000 }],
    customerId: customer.id,
    amountPaid: 0,
  });
  expect(await customerOutstanding(request, customer.id)).toBe(100000);

  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/orders/new');
  await addToCart(page, cartItem.sku, cartItem.name);
  await openCheckout(page);
  await pickExistingCustomer(page, customer);

  await expect(page.getByTestId('pos-customer-balance')).toContainText('Rs. 100,000');
  // Online: the drawer fetched the live balance, so the stale-data warning stays hidden.
  await expect(page.getByTestId('pos-customer-balance-offline')).toHaveCount(0);
  await expect(page.getByTestId('pos-customer-balance-loading')).toHaveCount(0);
});
