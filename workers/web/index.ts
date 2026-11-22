import { authenticateStaging } from './staging-auth';
import { HttpError, type SecurityEnv } from '../control/auth';
interface Env extends SecurityEnv {
  ASSETS: Fetcher;
  GUIDANCE: Fetcher;
  SURVEY: Fetcher;
  ENVIRONMENT: string;
  STAGING_CHECK_CLIENT_ID?: string;
}
const headers = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
};
export default {
  async fetch(request: Request, env: Env) {
    const u = new URL(request.url);
    const traceId = crypto.randomUUID();
    const forwarded = new Request(request);
    forwarded.headers.set('X-SWF-Trace-ID', traceId);
    try {
      if (env.ENVIRONMENT === 'staging') await authenticateStaging(request, env);
      if (u.hostname === 'www.sourcewayfinder.org') {
        u.hostname = 'sourcewayfinder.org';
        u.protocol = 'https:';
        return Response.redirect(u.href, 308);
      }
      let res: Response;
      if (u.pathname.startsWith('/api/v1/')) res = await env.GUIDANCE.fetch(forwarded);
      else if (u.pathname === '/api/survey' || u.pathname === '/api/survey/status')
        res = await env.SURVEY.fetch(forwarded);
      else if (['GET', 'HEAD'].includes(request.method)) res = await env.ASSETS.fetch(request);
      else res = new Response('Method not allowed', { status: 405 });
      const secured = new Response(res.body, res);
      for (const [k, v] of Object.entries(headers)) secured.headers.set(k, v);
      return secured;
    } catch (e) {
      const id = crypto.randomUUID();
      console.log(
        JSON.stringify({
          service: 'web',
          environment: env.ENVIRONMENT,
          requestId: id,
          code: 'UPSTREAM_UNAVAILABLE',
        }),
      );
      return Response.json(
        {
          code: 'SERVICE_UNAVAILABLE',
          requestId: id,
          message: 'Guidance is unavailable. Use the official links on the home page.',
        },
        {
          status: e instanceof HttpError ? e.status : 503,
          headers: { ...headers, 'Cache-Control': 'no-store' },
        },
      );
    }
  },
} satisfies ExportedHandler<Env>;
