import { createFileRoute } from "@tanstack/react-router";
import { EmployeeShell } from "@/components/EmployeeShell";

export const Route = createFileRoute("/employee")({
  component: EmployeeShell,
});
