import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, invokeLatest, runtime } = vi.hoisted(() => ({ invoke: vi.fn(), invokeLatest: vi.fn(), runtime: { pinned: false } }));

vi.mock("@/api/base44Client", () => ({
  base44: { functions: { invoke } },
  base44LatestFunctions: { functions: { invoke: invokeLatest } },
  get hasPinnedFunctionsVersion() { return runtime.pinned; },
}));

import AddressAutocomplete from "@/components/ui-custom/AddressAutocomplete";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

describe("AddressAutocomplete", () => {
  beforeEach(() => {
    invoke.mockReset();
    invokeLatest.mockReset();
    runtime.pinned = false;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("bewaart naast adresdelen ook de PDOK-coördinaten en BAG-identiteit", async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValue({
      data: {
        suggestions: [{
          address: "Reactorweg 1, 3542 AD Utrecht",
          street_name: "Reactorweg",
          house_number: "1",
          postal_code: "3542AD",
          city: "Utrecht",
          country: "Nederland",
          latitude: 52.116,
          longitude: 5.063,
          bag_address_id: "bag-1",
        }],
      },
    });
    const onAddressSelect = vi.fn();
    const onQueryChange = vi.fn();
    render(
      <>
        <label htmlFor="address">Objectadres</label>
        <AddressAutocomplete id="address" onAddressSelect={onAddressSelect} onQueryChange={onQueryChange} />
      </>,
    );

    fireEvent.change(screen.getByLabelText("Objectadres"), { target: { value: "Reactorweg 1" } });
    expect(onQueryChange).toHaveBeenCalledWith("Reactorweg 1");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(301);
    });
    const suggestion = screen.getByRole("option", { name: /Reactorweg 1/i });
    fireEvent.click(suggestion);

    expect(onAddressSelect).toHaveBeenCalledWith(expect.objectContaining({
      street_name: "Reactorweg",
      house_number: "1",
      postal_code: "3542AD",
      city: "Utrecht",
      latitude: 52.116,
      longitude: 5.063,
      bag_address_id: "bag-1",
      geocoding_status: "verified",
    }), expect.objectContaining({ address: "Reactorweg 1, 3542 AD Utrecht" }));
  });

  it("markeert een suggestie zonder echte coördinaten niet als geverifieerd", async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValue({
      data: {
        suggestions: [{
          address: "Ir. R.R. van der Zeelaan 1, 8191 JH Wapenveld",
          street_name: "Ir. R.R. van der Zeelaan",
          house_number: "1",
          postal_code: "8191JH",
          city: "Wapenveld",
          latitude: null,
          longitude: " ",
          bag_address_id: "bag-zonder-coordinaten",
        }],
      },
    });
    const onAddressSelect = vi.fn();
    render(<AddressAutocomplete id="legacy-address" onAddressSelect={onAddressSelect} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Ir. R.R. van der Zeelaan 1" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(301);
    });
    fireEvent.click(screen.getByRole("option", { name: /Ir. R.R. van der Zeelaan 1/i }));

    expect(onAddressSelect).toHaveBeenCalledWith(expect.objectContaining({
      latitude: null,
      longitude: null,
      geocoding_status: "unverified",
    }), expect.any(Object));
  });

  it("markeert een 0,0-suggestie niet als geverifieerd", async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValue({
      data: {
        suggestions: [{
          address: "Onbruikbare kaartpositie",
          latitude: 0,
          longitude: "0",
          bag_address_id: "bag-null-island",
        }],
      },
    });
    const onAddressSelect = vi.fn();
    render(<AddressAutocomplete id="null-island-address" onAddressSelect={onAddressSelect} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Onbruikbare kaartpositie" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(301);
    });
    fireEvent.click(screen.getByRole("option", { name: /Onbruikbare kaartpositie/i }));

    expect(onAddressSelect).toHaveBeenCalledWith(expect.objectContaining({
      latitude: null,
      longitude: null,
      geocoding_status: "unverified",
    }), expect.any(Object));
  });

  const address = (number = 2, addition = "") => ({
    address: `Dr. Jan van Breemenlaan ${number}${addition}, 8191 LA Wapenveld`,
    street_name: "Dr. Jan van Breemenlaan", house_number: String(number), house_number_addition: addition,
    postal_code: "8191LA", city: "Wapenveld", latitude: 52.442, longitude: 6.063,
    bag_address_id: `address-${number}-${addition || "base"}`,
  });
  const page = (suggestions, more = {}) => ({ data: { suggestions, total: suggestions.length, has_more: false, next_offset: null, ...more } });
  const typeQuery = async (value = "Dr. Jan van Breemenlaan 2") => {
    fireEvent.change(screen.getByRole("combobox"), { target: { value } });
    await act(async () => { await vi.advanceTimersByTimeAsync(301); });
  };

  it("toont twintig resultaten zonder lokale afkap en portalt de scrolllijst buiten de wizard", async () => {
    vi.useFakeTimers();
    const addresses = Array.from({ length: 20 }, (_, index) => address(index + 1));
    invoke.mockResolvedValue(page(addresses));
    render(<section data-testid="clipped-wizard" style={{ overflow: "hidden" }}><AddressAutocomplete id="many-addresses" /></section>);
    await typeQuery();
    expect(invoke).toHaveBeenCalledExactlyOnceWith("lookupService", { action: "search_address", query: "Dr. Jan van Breemenlaan 2", limit: 20, offset: 0 });
    const list = screen.getByRole("listbox", { name: "Gevonden adressen" });
    expect(screen.getAllByRole("option")).toHaveLength(20);
    expect(list).toHaveClass("overflow-y-auto", "overscroll-contain");
    expect(list).toHaveStyle({ maxHeight: "18rem" });
    expect(screen.getByTestId("clipped-wizard")).not.toContainElement(list);
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-controls", list.id);
    expect(screen.getByText("20 van 20 adressen")).toBeInTheDocument();
  });

  it("behoudt de serverrangorde en selecteert nummer 2 zonder toevoeging", async () => {
    vi.useFakeTimers();
    const suggestions = [address(), address(2, "b-2"), address(2, "k-2")];
    invoke.mockResolvedValue(page(suggestions));
    const select = vi.fn();
    render(<AddressAutocomplete onAddressSelect={select} />);
    await typeQuery();
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(suggestions.map(item => item.address));
    fireEvent.click(screen.getAllByRole("option")[0]);
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ house_number: "2", house_number_addition: "", geocoding_status: "verified" }), suggestions[0]);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("voegt een vervolgpagina toe zonder dubbele adressen of verlies van eerdere resultaten", async () => {
    vi.useFakeTimers();
    const first = Array.from({ length: 20 }, (_, index) => address(index + 1));
    invoke.mockResolvedValueOnce(page(first, { total: 22, has_more: true, next_offset: 20 })).mockResolvedValueOnce(page([first[19], address(21), address(22)], { total: 22 }));
    render(<AddressAutocomplete />);
    await typeQuery();
    fireEvent.click(screen.getByRole("button", { name: "Meer adressen" }));
    await act(async () => {});
    expect(invoke).toHaveBeenNthCalledWith(2, "lookupService", { action: "search_address", query: "Dr. Jan van Breemenlaan 2", limit: 20, offset: 20 });
    expect(screen.getAllByRole("option")).toHaveLength(22);
    expect(screen.getByText("22 van 22 adressen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Meer adressen" })).not.toBeInTheDocument();
  });

  it("bedient de lijst met toetsen zonder de omringende wizard in te dienen", async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValue(page([address(), address(2, "b-2")]));
    const select = vi.fn(), submit = vi.fn(event => event.preventDefault());
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
    render(<form onSubmit={submit}><AddressAutocomplete onAddressSelect={select} /></form>);
    await typeQuery();
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "End" });
    expect(input).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[1].id);
    expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
    fireEvent.keyDown(input, { key: "Home" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ house_number_addition: "" }), expect.any(Object));
    expect(submit).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("kan meer adressen laden met Page Down en sluiten met Escape", async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValueOnce(page([address()], { total: 2, has_more: true, next_offset: 20 })).mockResolvedValueOnce(page([address(2, "b-2")], { total: 2 }));
    render(<AddressAutocomplete />);
    await typeQuery();
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "PageDown" });
    await act(async () => {});
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("kiest voor adreszoeken direct het actuele contract in een gepinde preview", async () => {
    vi.useFakeTimers();
    runtime.pinned = true;
    invoke.mockResolvedValue(page([address(2, "b-2")]));
    invokeLatest.mockResolvedValue(page([address()]));
    render(<AddressAutocomplete />);
    await typeQuery();
    expect(invoke).not.toHaveBeenCalled();
    expect(invokeLatest).toHaveBeenCalledExactlyOnceWith("lookupService", { action: "search_address", query: "Dr. Jan van Breemenlaan 2", limit: 20, offset: 0 });
    expect(screen.getByRole("option")).toHaveTextContent(address().address);
  });

  it("onderscheidt zoeken, geen resultaten en een herstelbare fout zonder backendretry", async () => {
    vi.useFakeTimers();
    runtime.pinned = true;
    invokeLatest.mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce(page([]));
    render(<AddressAutocomplete />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Onbekende straat" } });
    expect(screen.getByRole("status")).toHaveTextContent("Adressen zoeken…");
    await act(async () => { await vi.advanceTimersByTimeAsync(301); });
    expect(screen.getByRole("alert")).toHaveTextContent("Adressen konden niet worden geladen");
    expect(screen.queryByText(/Geen adressen gevonden/)).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Opnieuw proberen" }));
    await act(async () => {});
    expect(screen.getByRole("status")).toHaveTextContent("Geen adressen gevonden");
    expect(invokeLatest).toHaveBeenCalledTimes(2);
  });

  it("negeert verouderde zoekresultaten na een nieuwe zoekopdracht", async () => {
    vi.useFakeTimers();
    let resolveOld;
    invoke.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce(page([address(3)]));
    render(<AddressAutocomplete />);
    await typeQuery("Breemenlaan 2");
    await typeQuery("Breemenlaan 3");
    await act(async () => { resolveOld(page([address()])); });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent(address(3).address);
  });

  it("behoudt eerdere adressen bij een vervolgpaginafout en laat de juiste pagina met Enter opnieuw laden", async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValueOnce(page([address()], { total: 2, has_more: true, next_offset: 20 }))
      .mockRejectedValueOnce(new Error("Page failed"))
      .mockResolvedValueOnce(page([address(3)], { total: 2 }));
    render(<AddressAutocomplete />);
    await typeQuery();
    fireEvent.click(screen.getByRole("button", { name: "Meer adressen" }));
    await act(async () => {});
    expect(screen.getByRole("alert")).toHaveTextContent("Adressen konden niet worden geladen");
    expect(screen.getByRole("option")).toHaveTextContent(address().address);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    await act(async () => {});
    expect(invoke).toHaveBeenNthCalledWith(3, "lookupService", expect.objectContaining({ offset: 20 }));
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["Escape", "blur"])("opent geen late resultaten na afsluiten via %s", async method => {
    vi.useFakeTimers();
    let resolveSearch;
    invoke.mockImplementation(() => new Promise(resolve => { resolveSearch = resolve; }));
    render(<><AddressAutocomplete /><button type="button">Volgende veld</button></>);
    const input = screen.getByRole("combobox");
    act(() => input.focus());
    await typeQuery();
    if (method === "Escape") fireEvent.keyDown(input, { key: "Escape" });
    else {
      act(() => screen.getByRole("button", { name: "Volgende veld" }).focus());
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    }
    await act(async () => { resolveSearch(page([address()])); });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("houdt vervolgresultaten gesloten wanneer tijdens meer laden een adres is gekozen", async () => {
    vi.useFakeTimers();
    let resolveMore;
    invoke.mockResolvedValueOnce(page([address()], { total: 2, has_more: true, next_offset: 20 })).mockImplementationOnce(() => new Promise(resolve => { resolveMore = resolve; }));
    const select = vi.fn();
    render(<AddressAutocomplete onAddressSelect={select} />);
    await typeQuery();
    fireEvent.click(screen.getByRole("button", { name: "Meer adressen" }));
    fireEvent.click(screen.getByRole("option"));
    await act(async () => { resolveMore(page([address(3)], { total: 2 })); });
    expect(select).toHaveBeenCalledOnce();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("Dr. Jan van Breemenlaan 2, 8191LA Wapenveld");
  });

  it("heropent de lijst niet wanneer Escape vanuit de popover terugfocus geeft aan het invoerveld", async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValue(page([address()], { total: 2, has_more: true, next_offset: 20 }));
    render(<AddressAutocomplete />);
    const input = screen.getByRole("combobox");
    act(() => input.focus());
    await typeQuery();
    const more = screen.getByRole("button", { name: "Meer adressen" });
    act(() => more.focus());
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    fireEvent.keyDown(more, { key: "Escape" });
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("negeert oude resultaten wanneer een extern adres de waarde tussentijds vervangt", async () => {
    vi.useFakeTimers();
    let resolveSearch;
    invoke.mockImplementation(() => new Promise(resolve => { resolveSearch = resolve; }));
    const { rerender } = render(<AddressAutocomplete value={{}} />);
    await typeQuery();
    rerender(<AddressAutocomplete value={address(3)} />);
    await act(async () => { resolveSearch(page([address()])); });
    expect(screen.getByRole("combobox")).toHaveValue("Dr. Jan van Breemenlaan 3, 8191LA Wapenveld");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("annuleert niet wanneer de ouder alleen de eigen ingetypte adreswaarde teruggeeft", async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValue(page([address(2, "b-2")]));
    function ControlledAddress() {
      const [value, setValue] = React.useState({});
      return <AddressAutocomplete value={value} onQueryChange={query => setValue(current => ({
        ...current, address: query, street_name: "", house_number: "", house_number_addition: "",
        postal_code: "", city: "", latitude: null, longitude: null, bag_address_id: null, geocoding_status: "unverified",
      }))} />;
    }
    render(<ControlledAddress />);
    await typeQuery("Dr. Jan van Breemenlaan 2b-2, 8191 LA Wapenveld");
    expect(invoke).toHaveBeenCalledOnce();
    expect(screen.getByRole("option")).toHaveTextContent(address(2, "b-2").address);
  });

  it("neemt bij nummer 2 zonder toevoeging geen oude toevoeging uit de huidige waarde over", async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValue(page([address()]));
    const select = vi.fn();
    render(<AddressAutocomplete value={address(2, "b-2")} onAddressSelect={select} />);
    await typeQuery("Dr. Jan van Breemenlaan 2, 8191 LA Wapenveld");
    fireEvent.click(screen.getByRole("option"));
    expect(select).toHaveBeenCalledWith(expect.objectContaining({
      street_name: "Dr. Jan van Breemenlaan", house_number: "2", house_number_addition: "",
      bag_address_id: "address-2-base", geocoding_status: "verified",
    }), address());
    expect(screen.getByRole("combobox")).toHaveValue("Dr. Jan van Breemenlaan 2, 8191LA Wapenveld");
  });

  it("laat de geportalde adreslijst in een echte modale dialoog scrollen en een adres kiezen", async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValue(page(Array.from({ length: 20 }, (_, index) => address(index + 1))));
    const select = vi.fn();
    render(<><div data-testid="background">Achtergrond</div><Dialog open><DialogContent><DialogTitle>Object aanmaken</DialogTitle><DialogDescription>Kies het objectadres.</DialogDescription><AddressAutocomplete onAddressSelect={select} /></DialogContent></Dialog></>);
    await typeQuery();
    const list = screen.getByRole("listbox");
    // JSDOM has no layout: describe a genuinely scrollable list so the test
    // detects the modal isolation boundary, rather than an unscrollable node.
    Object.defineProperties(list, { scrollHeight: { configurable: true, value: 1_000 }, clientHeight: { configurable: true, value: 200 } });
    list.style.overflowY = "auto";
    expect(screen.getByRole("dialog", { name: "Object aanmaken" })).not.toContainElement(list);
    const outsideWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 });
    screen.getByTestId("background").dispatchEvent(outsideWheel);
    expect(outsideWheel.defaultPrevented).toBe(true);
    const listWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 });
    list.dispatchEvent(listWheel);
    expect(listWheel.defaultPrevented).toBe(false);
    const touchMove = () => {
      const event = new Event("touchmove", { bubbles: true, cancelable: true });
      Object.defineProperties(event, { touches: { value: [{ clientX: 0, clientY: 20 }] }, changedTouches: { value: [{ clientX: 0, clientY: 20 }] } });
      return event;
    };
    fireEvent.touchStart(list, { touches: [{ clientX: 0, clientY: 100 }], changedTouches: [{ clientX: 0, clientY: 100 }] });
    const outsideTouch = touchMove();
    screen.getByTestId("background").dispatchEvent(outsideTouch);
    expect(outsideTouch.defaultPrevented).toBe(true);
    const listTouch = touchMove();
    list.dispatchEvent(listTouch);
    expect(listTouch.defaultPrevented).toBe(false);
    fireEvent.click(screen.getAllByRole("option")[1]);
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ house_number: "2", house_number_addition: "", bag_address_id: "address-2-base" }), address());
    expect(screen.getByRole("dialog", { name: "Object aanmaken" })).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
