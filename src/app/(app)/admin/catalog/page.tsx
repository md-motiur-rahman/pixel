import { listAllBrands } from "./catalog-actions";
import { BrandsSection } from "./brands-section";
import { ModelsSection } from "./models-section";
import { VariantsSection } from "./variants-section";

export default async function CatalogPage() {
  const brands = await listAllBrands();
  return (
    <div className="space-y-4">
      <BrandsSection initialBrands={brands} />
      <ModelsSection />
      <VariantsSection />
    </div>
  );
}
