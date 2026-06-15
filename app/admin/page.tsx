import type { ParkSummary } from "@/types/park";

export default async function AdminPage() {
  const response = await fetch("http://localhost:3000/api/parks", {
    cache: "no-store",
  });

  const parks = await response.json();

  return (
    <main className="p-8">
      <h1 className="mb-6 text-3xl font-bold">Admin</h1>

      <table className="w-full border">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Address</th>
          </tr>
        </thead>

        <tbody>
          {parks.slice(0, 100).map((park: ParkSummary) => (
            <tr key={park.id}>
              <td>{park.id}</td>
              <td>{park.name}</td>
              <td>{park.address}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
