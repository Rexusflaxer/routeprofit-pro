import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

export default function useObjectKeys(object) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["object-card", object.id, "keys"];
  const query = useQuery({
    queryKey,
    queryFn: () => base44.entities.ObjectKey.filter({ object_id: object.id }, "key_number"),
    retry: 1,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const save = useMutation({
    mutationFn: ({ current, form }) => current
      ? base44.entities.ObjectKey.update(current.id, form)
      : base44.entities.ObjectKey.create({ ...form, object_id: object.id, customer_id: object.customer_id }),
    onSuccess: async (_, variables) => {
      await refresh();
      toast({ title: variables.current ? "Sleutel opgeslagen" : "Sleutel toegevoegd" });
    },
  });
  const remove = useMutation({
    mutationFn: key => base44.entities.ObjectKey.delete(key.id),
    onSuccess: async () => { await refresh(); toast({ title: "Sleutel verwijderd" }); },
  });
  return { query, save, remove };
}