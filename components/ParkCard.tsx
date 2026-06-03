import { Park } from "@/types/park";

type Props = {
  park: Park;
};

export default function ParkCard({ park }: Props) {
  return (
    <div className="border rounded p-4">
      <h2>{park.name}</h2>
      <p>{park.address}</p>
    </div>
  );
}
