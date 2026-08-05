import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

const clientConfig = {
  appId,
  token,
  serverUrl: '',
  requiresAuth: true,
  appBaseUrl
};

//Create a client with authentication required
export const base44 = createClient({
  ...clientConfig,
  functionsVersion,
});

// Base44 previews can pin a backend snapshot through functions_version. Keep
// that behavior for normal previewing, while retaining one unpinned client so
// a newly synced action can recover from an obsolete preview snapshot.
export const hasPinnedFunctionsVersion = Boolean(functionsVersion);
export const base44LatestFunctions = hasPinnedFunctionsVersion
  ? createClient(clientConfig)
  : base44;
