import React from "react";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { GripVertical } from "lucide-react";
import ObjectWarningAddressActions from "./ObjectWarningAddressActions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { warningAvailabilityLabel, warningRelationshipLabel } from "./objectWarningAddressConfig";

export default function ObjectWarningAddressesDesktop({ rows, onEdit, onDelete, editingId, deletingId, onDragEnd, reorderDisabled, actionsDisabled, onShowAvailability }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <DragDropContext onDragEnd={onDragEnd}>
        <Table><TableHeader><TableRow className="bg-muted/25 hover:bg-muted/25">
          <TableHead className="w-16 text-xs font-semibold text-muted-foreground">Volgorde</TableHead>
          {[["contact", "Contactpersoon"], ["relationship", "Relatie"], ["phone", "Telefoon"], ["availability", "Bereikbaarheid"]].map(([key, label]) => <TableHead key={key} className="whitespace-nowrap text-xs font-semibold text-muted-foreground">{label}</TableHead>)}
          <TableHead className="w-10" />
        </TableRow></TableHeader>
        <Droppable droppableId="warning-addresses-desktop" direction="vertical">
          {provided => <TableBody ref={provided.innerRef} {...provided.droppableProps}>
            {rows.map((row, index) => <Draggable key={row.id} draggableId={`warning:${row.id}`} index={index} isDragDisabled={reorderDisabled}>
              {(drag, snapshot) => <TableRow ref={drag.innerRef} {...drag.draggableProps} onClick={() => onShowAvailability(row)} className={`cursor-pointer ${editingId === row.id ? "bg-primary/5" : "hover:bg-muted/25"} ${snapshot.isDragging ? "bg-card shadow-lg" : ""}`}>
                <TableCell><button type="button" {...drag.dragHandleProps} onClick={event => event.stopPropagation()} aria-label={`${row.display_name} verslepen`} className="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing disabled:cursor-not-allowed"><GripVertical className="h-4 w-4" /></button></TableCell>
                <TableCell><p className="font-medium text-foreground">{row.display_name || "Naamloos contact"}</p>{row.job_title && <p className="mt-0.5 text-xs text-muted-foreground">{row.job_title}</p>}</TableCell>
                <TableCell>{warningRelationshipLabel(row)}</TableCell>
                <TableCell><a href={`tel:${row.primary_phone}`} onClick={event => event.stopPropagation()} className="font-medium hover:underline">{row.primary_phone || "—"}</a>{row.secondary_phone && <p className="mt-0.5 text-xs text-muted-foreground">Alt. {row.secondary_phone}</p>}</TableCell>
                <TableCell className="text-sm">{warningAvailabilityLabel(row)}</TableCell>
                <TableCell><ObjectWarningAddressActions row={row} onEdit={onEdit} onDelete={onDelete} deleting={deletingId === row.id} disabled={actionsDisabled} /></TableCell>
              </TableRow>}
            </Draggable>)}
            {provided.placeholder}
          </TableBody>}
        </Droppable></Table>
      </DragDropContext>
    </div>
  );
}