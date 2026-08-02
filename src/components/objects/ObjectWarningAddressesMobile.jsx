import React from "react";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { GripVertical } from "lucide-react";
import ObjectWarningAddressActions from "./ObjectWarningAddressActions";
import { warningAvailabilityLabel, warningRelationshipLabel } from "./objectWarningAddressConfig";

export default function ObjectWarningAddressesMobile({ rows, onEdit, onDelete, editingId, deletingId, onDragEnd, reorderDisabled, actionsDisabled }) {
  return (
    <div className="md:hidden">
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="warning-addresses-mobile" direction="vertical">
          {provided => <div ref={provided.innerRef} {...provided.droppableProps} className="divide-y divide-border">
            {rows.map((row, index) => <Draggable key={row.id} draggableId={`warning-mobile:${row.id}`} index={index} isDragDisabled={reorderDisabled}>
              {(drag, snapshot) => <div ref={drag.innerRef} {...drag.draggableProps} className={`${editingId === row.id ? "bg-primary/5" : "bg-card"} ${snapshot.isDragging ? "shadow-lg" : ""}`}>
                <div className="flex items-start gap-2 px-3 py-3">
                  <button type="button" {...drag.dragHandleProps} aria-label={`${row.display_name} verslepen`} className="mt-0.5 cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"><GripVertical className="h-4 w-4" /></button>
                  <button type="button" onClick={() => onEdit(row)} className="min-w-0 flex-1 text-left">
                    <div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{row.display_name || "Naamloos contact"}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{warningRelationshipLabel(row)} · {row.primary_phone || "Geen nummer"}</p></div>
                    <p className="mt-2 text-xs text-muted-foreground">{warningAvailabilityLabel(row)}</p>
                  </button>
                  <ObjectWarningAddressActions row={row} onEdit={onEdit} onDelete={onDelete} deleting={deletingId === row.id} disabled={actionsDisabled} />
                </div>
              </div>}
            </Draggable>)}
            {provided.placeholder}
          </div>}
        </Droppable>
      </DragDropContext>
    </div>
  );
}