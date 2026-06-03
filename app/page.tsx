import { parks } from "@/lib/parks-data";
import ParkCard from "@/components/ParkCard";
export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">Total parks: {parks.length}</h1>

      <ul className="mt-6 space-y-2">
        {parks.slice(0, 20).map((park) => (
          <li key={park.id}>
            <ParkCard park={park} />
          </li>
        ))}
      </ul>
    </main>
  );
}
