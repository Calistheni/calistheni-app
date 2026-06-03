import { parks } from "@/lib/parks-data";

export default function Home() {
  return <p>{parks.length}</p>;
}
