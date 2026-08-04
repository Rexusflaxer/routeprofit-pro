import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export default function useSecurityPlans(object, categoryKey) {
  const client = useQueryClient();
  const queryKey = ["object-card", object.id, "security-plans", categoryKey];
  const refresh = () => client.invalidateQueries({ queryKey });
  const query = useQuery({ queryKey, queryFn: () => base44.entities.ObjectSecurityPlan.filter({ object_id: object.id, category: categoryKey, status: "active" }, "-updated_date") });
  const create = useMutation({ mutationFn: form => base44.entities.ObjectSecurityPlan.create({ customer_id: object.customer_id, object_id: object.id, category: categoryKey, status: "active", version: 1, ...form }), onSuccess: refresh });
  const update = useMutation({ mutationFn: ({ id, form, version }) => base44.entities.ObjectSecurityPlan.update(id, { ...form, version: Number(version || 1) + 1 }), onSuccess: refresh });
  return { plans: query.data || [], query, create, update };
}