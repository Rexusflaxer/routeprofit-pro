import React from "react";
import { Draggable } from "@hello-pangea/dnd";
import { GripVertical, Edit } from "lucide-react";
import { sanitizeContractBlockHtml } from "@/lib/contractTemplateEditor";

export default function TemplateArticleBlock({ block, index, onOpen }) {
  return (
    <Draggable draggableId={block.id} index={index}>
      {dragProvided => (
        <div
          ref={dragProvided.innerRef}
          {...dragProvided.draggableProps}
          className="overflow-hidden rounded-md border border-border bg-card transition-colors hover:border-primary/60 hover:bg-accent/25"
        >
          <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-2.5 py-2">
            <button
              type="button"
              {...dragProvided.dragHandleProps}
              className="flex w-7 shrink-0 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={`${block.display_label} verslepen`}
              title="Verslepen"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(block)}>
              <span className="flex items-center gap-2">
                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-primary">{block.display_label}</span>
                <span className="truncate text-sm font-semibold text-foreground">{block.title}</span>
              </span>
            </button>
            <button type="button" className="flex w-7 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground" onClick={() => onOpen(block)} aria-label={`${block.display_label} bewerken`}>
              <Edit className="h-3.5 w-3.5" />
            </button>
          </div>

        </div>
      )}
    </Draggable>
  );
}