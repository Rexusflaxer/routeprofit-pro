import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { licensePlate } = await req.json();

        if (!licensePlate) {
            return Response.json({ error: 'License plate required' }, { status: 400 });
        }

        // Kenteken normaliseren (hoofdletters, geen streepjes)
        const normalized = licensePlate.toUpperCase().replace(/[-\s]/g, '');

        // RDW Open Data API
        const url = `https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${normalized}`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.length === 0) {
            return Response.json({ 
                found: false, 
                message: 'Kenteken niet gevonden' 
            });
        }

        const vehicle = data[0];

        // Bepaal brandstoftype
        let fuelType = null;
        const brandstofOmschrijving = (vehicle.brandstof_omschrijving || '').toLowerCase();
        if (brandstofOmschrijving.includes('elektr')) {
            fuelType = 'elektrisch';
        } else if (brandstofOmschrijving.includes('hybr')) {
            fuelType = 'hybride';
        } else if (brandstofOmschrijving.includes('benzine')) {
            fuelType = 'benzine';
        } else if (brandstofOmschrijving.includes('diesel')) {
            fuelType = 'diesel';
        } else if (brandstofOmschrijving.includes('lpg')) {
            fuelType = 'lpg';
        }

        return Response.json({
            found: true,
            brand: vehicle.merk || '',
            model: vehicle.handelsbenaming || '',
            year: vehicle.datum_eerste_toelating ? parseInt(vehicle.datum_eerste_toelating.substring(0, 4)) : null,
            fuel_type: fuelType
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});