import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { NAVIGATION_RESULTS, SEARCH_SOURCES } from "./globalSearchConfig";

const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("nl-NL");
const matches = (value, query) => query.split(/\s+/).filter(Boolean).every(term => normalize(value).includes(term));

export default function useGlobalSearch(open, searchTerm) {
  const index = useQuery({
    queryKey: ["global-search-index"],
    queryFn: async () => Promise.all(SEARCH_SOURCES.map(async source => ({ source, records: await base44.entities[source.entity].list("-updated_date", 150) }))),
    enabled: open,
    staleTime: 60_000,
  });
  const results = useMemo(() => {
    const query = normalize(searchTerm.trim());
    if (!query) return [];
    const navigation = NAVIGATION_RESULTS.filter(item => matches(`${item.title} ${item.subtitle}`, query));
    const records = (index.data || []).flatMap(({ source, records }) => records.filter(record => matches(JSON.stringify(record), query)).slice(0, 8).map(record => ({ category: source.category, title: source.title(record) || source.category, subtitle: source.subtitle(record) || "", href: source.href(record), id: `${source.entity}-${record.id}` })));
    return [...navigation, ...records];
  }, [index.data, searchTerm]);
  return { results, isLoading: index.isLoading, isError: index.isError };
}