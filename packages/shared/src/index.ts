export type HealthResponse = {
  status: "ok" | "error";
  service: string;
  timestamp: string;
};
