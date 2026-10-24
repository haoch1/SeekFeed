import { chmodSync, existsSync, lstatSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

const CONTAINER = '/v1.45/containers/seekfeed-browser';
type DockerRequest = (path: string, method: string) => Promise<Response>;
const dockerRequest: DockerRequest = (path, method) => fetch('http://docker' + path, {
    unix: '/var/run/docker.sock', method, redirect: 'error', signal: AbortSignal.timeout(15000),
});

// This service has no TCP listener. Only the application shares its Unix socket;
// neither request paths nor bodies can select another Docker resource or action.
export function createBrowserController(docker: DockerRequest = dockerRequest) {
    let changing = false;
    async function inspect() {
        const response = await docker(CONTAINER + '/json', 'GET');
        if (response.status === 404) return { exists: false, running: false };
        if (!response.ok) throw new Error('inspect_failed');
        const info = await response.json() as any;
        const labels = info.Config?.Labels;
        if (labels?.['com.docker.compose.project'] !== 'seekfeed' || labels?.['com.docker.compose.service'] !== 'seekfeed-browser') throw new Error('container_mismatch');
        return { exists: true, running: Boolean(info.State?.Running) };
    }
    return async (request: Request) => {
        const url = new URL(request.url);
        const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
        if (url.search || request.headers.has('transfer-encoding') || Number(request.headers.get('content-length') || 0) !== 0 || request.body) return response({ error: 'invalid_request' }, 400);
        if (url.pathname === '/health' && request.method === 'GET') return response({ ready: true });
        if (!(url.pathname === '/status' && request.method === 'GET') && !(['/start', '/stop'].includes(url.pathname) && request.method === 'POST')) return response({ error: 'not_found' }, 404);
        if (changing) return response({ error: 'busy' }, 409);
        changing = true;
        try {
            const before = await inspect();
            if (url.pathname === '/status') return response(before);
            if (!before.exists && url.pathname === '/start') return response({ error: 'browser_not_created' }, 409);
            const starting = url.pathname === '/start';
            if (before.exists && before.running !== starting) {
                const result = await docker(CONTAINER + (starting ? '/start' : '/stop?t=8'), 'POST');
                if (![204, 304].includes(result.status)) throw new Error('control_failed');
            }
            const after = await inspect();
            if (after.running !== starting) throw new Error('state_mismatch');
            return response(after);
        } catch {
            // Never expose Docker's container configuration or daemon errors.
            return response({ error: 'browser_control_failed' }, 502);
        } finally { changing = false; }
    };
}

if (import.meta.main) {
    const socket = '/run/seekfeed-browser-control/control.sock';
    mkdirSync(dirname(socket), { recursive: true });
    if (existsSync(socket)) {
        if (!lstatSync(socket).isSocket()) throw new Error('Unexpected control socket file');
        unlinkSync(socket);
    }
    const server = Bun.serve({ unix: socket, idleTimeout: 30, maxRequestBodySize: 0, fetch: createBrowserController() });
    chmodSync(socket, 0o666);
    process.on('SIGTERM', () => { server.stop(true); process.exit(0); });
}
