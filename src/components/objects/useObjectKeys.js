import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const invoke = payload => base44.functions.invoke("objectKeyApi", payload).then(response => response.data);

export default function useObjectKeys(object) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["object-card", object.id, "keys"];
  const context = { object_id: object.id, customer_id: object.customer_id };
  const query = useQuery({ queryKey, queryFn: () => invoke({ action: "list", ...context }), retry: 1 });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const save = useMutation({
    mutationFn: ({ current, form }) => invoke({ action: current ? "update" : form.mode === "existing" ? "link" : "create", ...context, ...form }),
    onSuccess: async (_, variables) => { await refresh(); toast({ title: variables.current ? "Sleutel opgeslagen" : variables.form.mode === "existing" ? "Sleutel gekoppeld" : "Sleutel toegevoegd" }); },
  });
  const remove = useMutation({
    mutationFn: key => invoke({ action: "unlink", ...context, assignment_id: key.assignment_id, key_id: key.id }),
    onSuccess: async () => { await refresh(); toast({ title: "Sleutel verwijderd" }); },
  });
  return { query, save, remove };
}