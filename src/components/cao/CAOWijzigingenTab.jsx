import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const RISK_CONFIG = {
  low: { label: "Laag risico", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  medium: { label: "Medium risico", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  high: { label: "Hoog risico", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" }
};

const CHANGE_TYPE_LABELS = {
  added: "Toegevoegd",
  changed: "Gewijzigd",
  removed: "Verwijderd",
  needs_mapping: "Mapping vereist",
  needs_legal_review: "Juridische review vereist"
};

function ReviewCard({ review, onReview }) {
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const risk = RISK_CONFIG[review.risk_level] || RISK_CONFIG.medium;

  return (
    <Card className={`border ${review.risk_level === 'high' ? 'border-red-300 dark:border-red-800' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{review.field_path}</code>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${risk.color}`}>
                {risk.label}
              </span>
              <Badge variant="outline" className="text-xs">
                {CHANGE_TYPE_LABELS[review.change_type] || review.change_type}
              </Badge>
              {review.change_type === 'needs_legal_review' && (
                <div className="flex items-center gap-1 text-xs text-red-600 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Juridische review vereist
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
              <span className="text-muted-foreground">
                Oud: <span className="font-mono text-foreground">{JSON.stringify(review.old_value)}</span>
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="text-muted-foreground">
                Nieuw: <span className="font-mono text-green-700 dark:text-green-400">{JSON.stringify(review.new_value)}</span>
              </span>
            </div>
            {review.source_reference && (
              <p className="text-xs text-muted-foreground mt-1">Bron: {review.source_reference}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowNotes(!showNotes)}
              className="text-xs"
            >
              Notitie
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onReview(review.id, "rejected", notes)}
              className="gap-1"
            >
              <XCircle className="w-3.5 h-3.5" />
              Afwijzen
            </Button>
            <Button
              size="sm"
              onClick={() => onReview(review.id, "approved", notes)}
              className="gap-1"
              disabled={review.risk_level === 'high' && !notes}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Goedkeuren
            </Button>
          </div>
        </div>
        {showNotes && (
          <Textarea
            className="mt-3 text-xs"
            placeholder="Voeg een notitie toe..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
          />
        )}
        {review.risk_level === 'high' && !notes && (
          <p className="text-xs text-red-500 mt-1">Voeg een notitie toe bij hoog-risico wijzigingen.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function CAOWijzigingenTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["cao-change-reviews"],
    queryFn: () => base44.entities.CAOChangeReview.list("-created_date", 100)
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, notes }) =>
      base44.entities.CAOChangeReview.update(id, {
        status,
        review_notes: notes,
        reviewed_at: new Date().toISOString()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cao-change-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["cao-change-reviews-pending"] });
      toast({ title: "Review opgeslagen" });
    }
  });

  const pending = reviews.filter(r => r.status === "pending");
  const reviewed = reviews.filter(r => r.status !== "pending");

  if (isLoading) return <div className="text-sm text-muted-foreground py-6 text-center">Laden...</div>;

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Openstaand ({pending.length})
          </h3>
          {pending.map(review => (
            <ReviewCard
              key={review.id}
              review={review}
              onReview={(id, status, notes) => reviewMutation.mutate({ id, status, notes })}
            />
          ))}
        </div>
      )}

      {reviewed.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Verwerkt ({reviewed.length})
          </h3>
          {reviewed.slice(0, 10).map(review => (
            <Card key={review.id} className="opacity-60">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 text-xs">
                  {review.status === "approved"
                    ? <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                    : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                  <code className="font-mono">{review.field_path}</code>
                  <span className="text-muted-foreground">
                    {review.status === "approved" ? "Goedgekeurd" : "Afgewezen"}
                  </span>
                  {review.review_notes && <span className="text-muted-foreground">— {review.review_notes}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {reviews.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">Geen wijzigingen gevonden.</p>
        </div>
      )}
    </div>
  );
}