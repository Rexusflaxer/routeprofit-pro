import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { archiveObjectKey, listObjectKeys, saveObjectKey } from "./objectKeyWorkflow";

export default function useObjectKeys(object) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["object-card", object.id, "keys"];
  const context = { objectId: object.id, customerId: object.customer_id };
  const query = useQuery({ queryKey, queryFn: () => listObjectKeys(context), retry: 1 });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const save = useMutation({
    mutationFn: variables => saveObjectKey({ ...context, ...variables }),
    onSuccess: async (_, variables) => { await refresh(); toast({ title: variables.current ? "Sleutel opgeslagen" : "Sleutel toegevoegd" }); },
    onError: async error => {
      if (error.status === 409) await refresh();
      toast({ title: "Opslaan mislukt", description: error.message, variant: "destructive" });
    },
  });
  const remove = useMutation({
    mutationFn: variables => archiveObjectKey({ ...context, ...variables }),
    onSuccess: async () => { await refresh(); toast({ title: "Sleutel verwijderd" }); },
    onError: async error => {
      if (error.status === 409) await refresh();
      toast({ title: "Verwijderen mislukt", description: error.message, variant: "destructive" });
    },
  });
  return { query, save, remove };
}
