import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, CheckCircle2, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";

export default function MobileRoutePublishButton({ route, dateKey, existingExecution }) {
  const queryClient = useQueryClient();

  const publishMutation = useMutation({
    mutationFn: () => base44.functions.invoke("mobileApi", {
      action: "create_route_execution",
      route_id: route.id,
      service_date: dateKey,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["route-executions"] });
      queryClient.invalidateQueries({ queryKey: ["task-executions"] });
    },
  });

  if (existingExecution) {
    return (
      <Button size="sm" variant="outline" disabled className="border-green-200 bg-green-50 text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Mobiel
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={publishMutation.isPending}
      onClick={() => publishMutation.mutate()}
      className="bg-white"
    >
      {publishMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
      Naar mobiel
    </Button>
  );
}
