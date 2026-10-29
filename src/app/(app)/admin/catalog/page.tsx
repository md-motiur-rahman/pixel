import { listBrandsWithCounts } from "./catalog-actions";
import { CatalogBrowser } from "./catalog-browser";

export default async function CatalogPage() {
  const brands = await listBrandsWithCounts();
  return <CatalogBrowser initialBrands={brands} />;
}
