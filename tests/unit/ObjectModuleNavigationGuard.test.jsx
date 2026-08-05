import React, { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useObjectModuleNavigationGuard } from "@/components/objects/useObjectModuleNavigationGuard";

function GuardHarness({ initiallyDirty = true, onLeave = () => {}, onSave = async () => {}, register = null }) {
  const [dirty, setDirty] = useState(initiallyDirty);
  const guard = useObjectModuleNavigationGuard({
    dirty,
    moduleName: "Middelenuitgifte Saturn",
    onSave: async () => {
      await onSave();
      setDirty(false);
    },
    onRegisterNavigationGuard: register,
  });
  return <>
    <button type="button" onClick={() => setDirty(value => !value)}>Wijzig dirty</button>
    <button type="button" onClick={() => guard.requestNavigation(onLeave, { destinationLabel: "Objecten" })}>Werkruimte verlaten</button>
    <button type="button" onClick={() => guard.navigateWithinWorkspace(onLeave)}>Intern onderdeel openen</button>
    {guard.dialog}
  </>;
}

describe("useObjectModuleNavigationGuard", () => {
  beforeEach(() => {
    window.history.replaceState({ idx: 0 }, "", "/ObjectDetail?id=object-1&tab=modules&view=edit&row=module-1");
    vi.spyOn(window.history, "back").mockImplementation(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("waarschuwt bij verlaten en kan eerst opslaan of bewust verwerpen", async () => {
    const onLeave = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<MemoryRouter><GuardHarness onLeave={onLeave} onSave={onSave} /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "Werkruimte verlaten" }));
    expect(screen.getByRole("heading", { name: "Wijzigingen nog niet opgeslagen" })).toBeInTheDocument();
    expect(onLeave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Opslaan en doorgaan" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    await waitFor(() => expect(onLeave).toHaveBeenCalledOnce());
  });

  it("wisselt intern van onderdeel zonder lokale invoer te verliezen of een dialoog te tonen", async () => {
    const openSection = vi.fn();
    render(<MemoryRouter><GuardHarness onLeave={openSection} /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "Intern onderdeel openen" }));

    await waitFor(() => expect(openSection).toHaveBeenCalledOnce());
    expect(screen.queryByRole("heading", { name: "Wijzigingen nog niet opgeslagen" })).not.toBeInTheDocument();
  });

  it("registreert de objectkaartguard en activeert beforeunload zolang wijzigingen lokaal zijn", async () => {
    let registeredGuard = null;
    const register = vi.fn(guard => {
      registeredGuard = guard;
      return () => { registeredGuard = null; };
    });
    const leaveFromParent = vi.fn();
    render(<MemoryRouter><GuardHarness register={register} /></MemoryRouter>);

    await waitFor(() => expect(typeof registeredGuard).toBe("function"));
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    act(() => registeredGuard(leaveFromParent, { destinationLabel: "Waarschuwingsadressen" }));
    expect(screen.getByText(/naar Waarschuwingsadressen/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zonder opslaan doorgaan" }));
    await waitFor(() => expect(leaveFromParent).toHaveBeenCalledOnce());
  });

  it("vangt browser Terug op voordat de werkruimte met lokale wijzigingen wordt verlaten", async () => {
    render(<MemoryRouter><GuardHarness /></MemoryRouter>);

    act(() => window.history.back());

    expect(await screen.findByRole("heading", { name: "Wijzigingen nog niet opgeslagen" })).toBeInTheDocument();
    expect(window.history.back).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Zonder opslaan doorgaan" }));
    await waitFor(() => expect(window.history.back).toHaveBeenCalledTimes(2));
  });
});
