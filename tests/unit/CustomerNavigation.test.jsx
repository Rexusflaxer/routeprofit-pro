import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  CustomerRow,
  customerDetailHref,
} from "@/pages/Customers";
import {
  Table,
  TableBody,
} from "@/components/ui/table";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

const customer = {
  id: "customer/42",
  name: "Acme Beveiliging",
  customer_number: "KL-0042",
  customer_type: "bedrijf",
  status: "active",
  email: "contact@acme.example",
};

describe("klantnavigatie", () => {
  it("bouwt een herlaadbare, veilig gecodeerde dossierdeeplink", () => {
    expect(customerDetailHref(customer.id)).toBe(
      "/CustomerDetail?id=customer%2F42&tab=overview",
    );
    expect(customerDetailHref(customer.id, { edit: true })).toBe(
      "/CustomerDetail?id=customer%2F42&tab=overview&edit=1",
    );
  });

  it("opent het dossier via de klantlink en laat de hele rij klikbaar", () => {
    const onOpen = vi.fn();
    render(
      <MemoryRouter initialEntries={["/Customers"]}>
        <Routes>
          <Route
            path="/Customers"
            element={(
              <Table>
                <TableBody>
                  <CustomerRow customer={customer} objects={[]} onOpen={onOpen} />
                </TableBody>
              </Table>
            )}
          />
          <Route path="/CustomerDetail" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("Geen objecten"));
    expect(onOpen).toHaveBeenCalledWith(customer);

    fireEvent.click(screen.getByText("Acme Beveiliging"));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/CustomerDetail?id=customer%2F42&tab=overview",
    );
  });
});
