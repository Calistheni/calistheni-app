export type ProductRefreshResult<T> = {
  products: T[];
  applied: boolean;
};

export type ProductRefreshCoordinator<T> = {
  refresh: () => Promise<ProductRefreshResult<T>>;
  dispose: () => void;
};

type DisplayedProduct = { productId: string; displayPrice: string };

export function getAppleProductPurchaseIssue(
  displayedProduct: DisplayedProduct,
  refreshed: ProductRefreshResult<DisplayedProduct> | null
) {
  if (!refreshed?.applied) return "refresh_failed";
  const currentProduct = refreshed.products.find(
    (product) => product.productId === displayedProduct.productId
  );
  if (!currentProduct) return "unavailable";
  if (currentProduct.displayPrice !== displayedProduct.displayPrice) {
    return "price_changed";
  }
  return null;
}

export function createProductRefreshCoordinator<T>({
  loadProducts,
  replaceProducts,
}: {
  loadProducts: () => Promise<T[]>;
  replaceProducts: (products: T[]) => void;
}): ProductRefreshCoordinator<T> {
  let disposed = false;
  let inFlight: Promise<ProductRefreshResult<T>> | null = null;

  return {
    refresh() {
      if (inFlight) return inFlight;

      const operation: Promise<ProductRefreshResult<T>> = loadProducts()
        .then((products) => {
          if (!disposed) replaceProducts(products);
          return { products, applied: !disposed };
        })
        .finally(() => {
          if (inFlight === operation) inFlight = null;
        });
      inFlight = operation;
      return operation;
    },
    dispose() {
      disposed = true;
    },
  };
}
