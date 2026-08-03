import React from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { INSTALLATION_STATUS, installationTypeLabel } from "./objectInstallationConfig";

export default function ObjectInstallationTable({ installations }) {
  return <div className="overflow-x-auto"><Table>
    <TableHeader><TableRow className="bg-muted/25 hover:bg-muted/25">
      <TableHead>Installatie</TableHead><TableHead>Type</TableHead><TableHead>Merk / model</TableHead><TableHead>Locatie</TableHead><TableHead>Status</TableHead>
    </TableRow></TableHeader>
    <TableBody>{installations.map(installation => {
      const status = INSTALLATION_STATUS[installation.status] || INSTALLATION_STATUS.inactive;
      return <TableRow key={installation.id}>
        <TableCell className="font-medium">{installation.name}</TableCell>
        <TableCell>{installationTypeLabel(installation)}</TableCell>
        <TableCell>{[installation.brand, installation.model].filter(Boolean).join(" · ") || "—"}</TableCell>
        <TableCell>{installation.location || "—"}</TableCell>
        <TableCell><Badge variant="outline" className={`text-[11px] ${status.className}`}>{status.label}</Badge></TableCell>
      </TableRow>;
    })}</TableBody>
  </Table></div>;
}