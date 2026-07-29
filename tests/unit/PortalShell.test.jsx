import React from "react";
import { Building2, FileText } from "lucide-react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PortalShell from "@/components/customer-portal/PortalShell";

describe("PortalShell", () => {
  it("toont alleen de aangeleverde modules en stuurt navigatie expliciet terug", () => {
    const onTabChange = vi.fn();
    const onLogout = vi.fn();
    render(
      <PortalShell
        customer={{ name: "Acme Beveiliging", legal_name: "Acme Beveiliging B.V.", customer_number: "KL-0042" }}
        user={{ full_name: "Ada Klant", email: "ada@example.nl" }}
        tabs={[
          { id: "objects", label: "Objecten", icon: Building2 },
          { id: "reports", label: "Rapportages", icon: FileText },
        ]}
        activeTab="objects"
        onTabChange={onTabChange}
        onLogout={onLogout}
      >
        <p>Veilige portaalinhoud</p>
      </PortalShell>,
    );

    expect(screen.getByText("Acme Beveiliging")).toBeInTheDocument();
    expect(screen.getByText("Veilige portaalinhoud")).toBeInTheDocument();
    expect(screen.queryByText("Facturatie")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rapportages" }));
    expect(onTabChange).toHaveBeenCalledWith("reports");

    fireEvent.click(screen.getByRole("button", { name: "Uitloggen" }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
