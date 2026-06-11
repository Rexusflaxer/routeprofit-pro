import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { iban } = await req.json();
    
    if (!iban) {
      return Response.json({ error: 'IBAN is required' }, { status: 400 });
    }

    const cleanIban = iban.replace(/\s/g, '').toUpperCase();
    
    // Validate IBAN format
    const ibanPattern = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{18,34}$/;
    if (!ibanPattern.test(cleanIban)) {
      return Response.json({ error: 'Invalid IBAN format' }, { status: 400 });
    }

    // Try to lookup using free IBAN API (ibanapi.com or fallback to basic extraction)
    let bic = null;
    let bankName = null;

    try {
      // Use a simple IBAN structure to extract BIC for NL accounts
      // Format: CCDD SSSS CCCC CCCC CC where S = bank code (BIC-like)
      const countryCode = cleanIban.substring(0, 2);
      
      if (countryCode === 'NL') {
        // Dutch IBAN structure: NL + 2 check digits + 4 bank code + 10 account number
        const bankCode = cleanIban.substring(4, 8);
        
        // Map common Dutch bank codes to BIC
        const dutchBankMap = {
          'ABNA': { bic: 'ABNANL2A', name: 'ABN AMRO' },
          'RABO': { bic: 'RABONL2U', name: 'Rabobank' },
          'INGB': { bic: 'INGBNL2A', name: 'ING' },
          'BUNQ': { bic: 'BUNQNL2A', name: 'bunq' },
          'ARSP': { bic: 'ARSPNL2A', name: 'Argenta' },
          'BHBLNL': { bic: 'BHBLNL2R', name: 'BHBl' },
          'GKCC': { bic: 'GKCCNL2H', name: 'Geldkoerier' },
          'AKAB': { bic: 'AKABNL2H', name: 'Akabe' },
          'KBASB': { bic: 'KBASBL2X', name: 'KBC' },
        };
        
        const mapping = dutchBankMap[bankCode];
        if (mapping) {
          bic = mapping.bic;
          bankName = mapping.name;
        }
      }
    } catch (err) {
      console.log('IBAN lookup fallback skipped:', err.message);
    }

    return Response.json({
      iban: cleanIban,
      bic: bic || null,
      bankName: bankName || null,
      status: bic ? 'found' : 'partial',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});