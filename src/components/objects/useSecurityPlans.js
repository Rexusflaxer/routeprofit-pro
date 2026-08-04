import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export default function useSecurityPlans(object) {
  const client = useQueryClient();
  const queryKey = ["object-card", object.id, "security-plans", "fire-closing-round"];
  const query = useQuery({ queryKey, queryFn: () => base44.entities.ObjectSecurityPlan.filter({ object_id: object.id, category: "fire_closing_round", status: "active" }, "-created_date") });
  const create = useMutation({
    mutationFn: form => base44.entities.ObjectSecurityPlan.create({ customer_id: object.customer_id, object_id: object.id, category: "fire_closing_round", status: "active", ...form }),
    onSuccess: () => client.invalidateQueries({ queryKey }),
  });
  return { plans: query.data || [], query, create };
}