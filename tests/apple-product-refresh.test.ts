import assert from "node:assert/strict";
import test from "node:test";
import { createProductRefreshCoordinator } from "../lib/apple-product-refresh.ts";

type Product = { productId: string; displayPrice: string };

test("a successful refresh atomically replaces stale product metadata", async () => {
  let products: Product[] = [{ productId: "monthly", displayPrice: "€4.99" }];
  const currentProducts: Product[] = [
    { productId: "monthly", displayPrice: "€7.99" },
  ];
  const coordinator = createProductRefreshCoordinator<Product>({
    loadProducts: async () => currentProducts,
    replaceProducts: (next) => {
      products = next;
    },
  });

  const result = await coordinator.refresh();

  assert.equal(result.applied, true);
  assert.deepEqual(products, currentProducts);
});

test("a failed refresh preserves the previous valid product metadata", async () => {
  const previousProducts: Product[] = [
    { productId: "monthly", displayPrice: "€7.99" },
  ];
  let products = previousProducts;
  const coordinator = createProductRefreshCoordinator<Product>({
    loadProducts: async () => {
      throw new Error("temporary StoreKit failure");
    },
    replaceProducts: (next) => {
      products = next;
    },
  });

  await assert.rejects(coordinator.refresh(), /temporary StoreKit failure/);
  assert.strictEqual(products, previousProducts);
});

test("overlapping refreshes share one StoreKit request", async () => {
  let loadCount = 0;
  let resolveLoad!: (products: Product[]) => void;
  const load = new Promise<Product[]>((resolve) => {
    resolveLoad = resolve;
  });
  const coordinator = createProductRefreshCoordinator({
    loadProducts: async () => {
      loadCount += 1;
      return load;
    },
    replaceProducts: () => undefined,
  });

  const first = coordinator.refresh();
  const second = coordinator.refresh();
  resolveLoad([{ productId: "monthly", displayPrice: "€7.99" }]);

  assert.strictEqual(first, second);
  await first;
  assert.equal(loadCount, 1);
});

test("disposing during a refresh prevents an update after unmount", async () => {
  let resolveLoad!: (products: Product[]) => void;
  const load = new Promise<Product[]>((resolve) => {
    resolveLoad = resolve;
  });
  let applied = false;
  const coordinator = createProductRefreshCoordinator({
    loadProducts: async () => load,
    replaceProducts: () => {
      applied = true;
    },
  });

  const refresh = coordinator.refresh();
  coordinator.dispose();
  resolveLoad([{ productId: "monthly", displayPrice: "€7.99" }]);

  const result = await refresh;
  assert.equal(result.applied, false);
  assert.equal(applied, false);
});
