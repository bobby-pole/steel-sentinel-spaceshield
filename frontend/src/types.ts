export interface Unit {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: "active" | "idle" | "sos";
  role: "recon" | "medic" | "engineer" | "command";
}
