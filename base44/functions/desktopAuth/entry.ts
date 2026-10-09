import { createClient, createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { handleDesktopAuth } from './protocol.ts';
Deno.serve((request: Request) => handleDesktopAuth(request, {createClient, createClientFromRequest, env: key => Deno.env.get(key)}));
