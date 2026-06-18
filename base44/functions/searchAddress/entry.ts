import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { query } = await req.json();

        if (!query || query.length < 3) {
            return Response.json({ suggestions: [] });
        }

        // PDOK Locatieserver API (gratis Nederlandse overheids-API voor adressen)
        const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(query)}&rows=5`;
        
        const response = await fetch(url);
        const data = await response.json();

        const suggestions = (data.response?.docs || [])
            .filter(doc => doc.huisnummer || doc.type === 'adres')
            .map(doc => {
                const coords = doc.centroide_ll ? doc.centroide_ll.replace('POINT(', '').replace(')', '').split(' ') : null;
                return {
                    address: doc.weergavenaam || doc.straatnaam,
                    latitude: coords ? parseFloat(coords[1]) : null,
                    longitude: coords ? parseFloat(coords[0]) : null,
                };
            });

        return Response.json({ suggestions });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});