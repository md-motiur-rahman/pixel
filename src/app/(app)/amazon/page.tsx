import { listAmazonItems, listGradeOptions } from "./actions";
import { AmazonScreen } from "./amazon-screen";

export default async function AmazonPage() {
  const [initial, grades] = await Promise.all([listAmazonItems("waiting"), listGradeOptions()]);
  return <AmazonScreen initial={initial} grades={grades} />;
}
