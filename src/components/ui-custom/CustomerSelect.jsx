import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CustomerSelect({ customers, value, onValueChange, placeholder = "Selecteer klant..." }) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const selectedCustomer = customers.find(c => c.id === value);

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {value && selectedCustomer
            ? `${selectedCustomer.name} (${selectedCustomer.customer_type})`
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <div className="space-y-2 p-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Zoek klant..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-2 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filteredCustomers.length === 0 ? (
              <div className="px-2 py-3 text-xs text-slate-500 text-center">Geen klanten gevonden.</div>
            ) : (
              filteredCustomers.map(customer => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => {
                    onValueChange(customer.id);
                    setOpen(false);
                    setSearchTerm("");
                  }}
                  className={cn(
                    "w-full text-left flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-slate-100 transition-colors",
                    value === customer.id && "bg-slate-100"
                  )}
                >
                  <Check
                    className={cn(
                      "h-4 w-4 flex-shrink-0",
                      value === customer.id ? "opacity-100 text-slate-900" : "opacity-0"
                    )}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">{customer.name}</div>
                    <div className="text-xs text-slate-400">({customer.customer_type})</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}