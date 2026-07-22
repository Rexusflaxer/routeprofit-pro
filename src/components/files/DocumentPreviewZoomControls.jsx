import React from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function DocumentPreviewZoomControls({
  zoom,
  onZoomChange,
  minimum = 50,
  maximum = 200,
  step = 10,
}) {
  const setZoom = value => onZoomChange(Math.min(maximum, Math.max(minimum, value)));

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex shrink-0 items-center rounded-md border border-border bg-background p-0.5 shadow-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setZoom(zoom - step)}
              disabled={zoom <= minimum}
              aria-label="PDF-preview uitzoomen"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Uitzoomen</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 min-w-[54px] px-2 font-mono text-[11px]"
              onClick={() => setZoom(100)}
              aria-label={`Zoom herstellen naar 100 procent, huidige zoom ${zoom} procent`}
            >
              {zoom}%
            </Button>
          </TooltipTrigger>
          <TooltipContent>Herstel naar 100%</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setZoom(zoom + step)}
              disabled={zoom >= maximum}
              aria-label="PDF-preview inzoomen"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Inzoomen</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
