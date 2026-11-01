import express from 'express';
import http from 'node:http';
import { CP4_BACKEND_SERVICE } from '../src/services/cpAnalysisBackend';
import { handleCPAnalysisAI } from '../server/cpAnalysisAI';
import { serveCP4Analysis } from '../server/cpAnalysisDeadline';

async function runDiagnostic() {
  console.log('=== STARTING CP4 DIAGNOSTIC RUNTIME AUDIT ===');
  
  // 1. Setup temporary server to test server.ts / Express API route behavior
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.use('/api', (req, res, next) => {
    const reqId = (req.headers['x-cp4-request-id'] as string) || '-';
    console.log(`[TEST IN] ${req.method} ${req.path} | ReqID: ${reqId}`);
    next();
  });

  app.get('/api/health', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      service: CP4_BACKEND_SERVICE,
      status: 'ok',
      requestId: req.headers['x-cp4-request-id'],
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/ai/analyze-cp-ping', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const reqId = (req.headers['x-cp4-request-id'] as string) || 'ping-test';
    res.setHeader('X-CP4-Request-ID', reqId);
    res.setHeader('X-CP4-Service', CP4_BACKEND_SERVICE);
    res.json({
      status: 'ok',
      diagnostic: 'express_post_handler_reached',
      service: CP4_BACKEND_SERVICE,
      requestId: reqId,
      receivedBodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : [],
    });
  });

  app.post('/api/ai/analyze-cp', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY || null;
    return serveCP4Analysis(req, res, apiKey, undefined); // Uses pedagogical engine fallback when no live key in test runner
  });

  app.use('/api', (err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ error: err.message, service: CP4_BACKEND_SERVICE });
  });

  app.all('/api/*', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.status(404).json({ error: 'Unknown API route', path: req.path });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Test Express server running at ${baseUrl}`);

  try {
    // Test 1: GET /api/health
    const healthRes = await fetch(`${baseUrl}/api/health`, {
      headers: { 'X-CP4-Request-ID': 'cp4-test-health-001' },
    });
    const healthMime = healthRes.headers.get('content-type') || '';
    const healthJson = await healthRes.json();
    console.log(`[PASS 1] GET /api/health -> Status: ${healthRes.status}, MIME: ${healthMime}, Service: ${healthJson.service}`);
    if (healthRes.status !== 200 || !healthMime.includes('application/json')) {
      throw new Error('Health check failed MIME or status test');
    }

    // Test 2: POST /api/ai/analyze-cp-ping
    const pingRes = await fetch(`${baseUrl}/api/ai/analyze-cp-ping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CP4-Request-ID': 'cp4-test-ping-002',
      },
      body: JSON.stringify({ testKey: 'testVal' }),
    });
    const pingMime = pingRes.headers.get('content-type') || '';
    const pingJson = await pingRes.json();
    console.log(`[PASS 2] POST /api/ai/analyze-cp-ping -> Status: ${pingRes.status}, MIME: ${pingMime}, Diagnostic: ${pingJson.diagnostic}`);
    if (pingRes.status !== 200 || !pingMime.includes('application/json') || pingJson.diagnostic !== 'express_post_handler_reached') {
      throw new Error('POST Ping check failed');
    }

    // Test 3: POST /api/ai/analyze-cp (Bahasa Indonesia - 4 Elemen)
    const bindoBody = {
      subject: 'Bahasa Indonesia',
      grade: 'Kelas 4',
      phase: 'Fase B',
      curriculum: 'Kurikulum Merdeka',
      cpText: 'Capaian Pembelajaran Bahasa Indonesia SD Fase B',
      elements: [
        { id: 'elem-bind-1', code: 'E1', name: 'Menyimak', content: 'Peserta didik mampu memahami ide pokok dari teks audio dan penjelasan guru.' },
        { id: 'elem-bind-2', code: 'E2', name: 'Membaca dan Memirsa', content: 'Peserta didik mampu membaca kata-kata dengan fasih dan memahami pesan cerita.' },
        { id: 'elem-bind-3', code: 'E3', name: 'Berbicara dan Mempresentasikan', content: 'Peserta didik mampu menyampaikan gagasan secara lisan dengan santun dan jelas.' },
        { id: 'elem-bind-4', code: 'E4', name: 'Menulis', content: 'Peserta didik mampu menulis teks narasi singkat dengan ejaan yang benar.' },
      ],
    };

    const bindoReqId = 'cp4-bind-00000000-0000-4000-a000-000000000001';
    const bindoRes = await fetch(`${baseUrl}/api/ai/analyze-cp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CP4-Request-ID': bindoReqId,
      },
      body: JSON.stringify(bindoBody),
    });

    const bindoMime = bindoRes.headers.get('content-type') || '';
    const bindoJson = await bindoRes.json();
    console.log(`[PASS 3] POST /api/ai/analyze-cp Bahasa Indonesia -> Status: ${bindoRes.status}, MIME: ${bindoMime}, Items Count: ${bindoJson.data?.items?.length || 0}`);
    if (bindoRes.status !== 200 || !bindoMime.includes('application/json') || bindoJson.data?.items?.length !== 4) {
      throw new Error('Bahasa Indonesia 4 Elemen analysis failed');
    }

    // Test 4: POST /api/ai/analyze-cp (Matematika - 4 Elemen)
    const matBody = {
      subject: 'Matematika',
      grade: 'Kelas 4',
      phase: 'Fase B',
      curriculum: 'Kurikulum Merdeka',
      cpText: 'Capaian Pembelajaran Matematika SD Fase B',
      elements: [
        { id: 'elem-mat-1', code: 'E1', name: 'Bilangan', content: 'Peserta didik menunjukkan pemahaman dan intuisi bilangan pada bilangan cacah sampai 10.000.' },
        { id: 'elem-mat-2', code: 'E2', name: 'Aljabar', content: 'Peserta didik dapat mengisi nilai yang belum diketahui dalam sebuah kalimat matematika.' },
        { id: 'elem-mat-3', code: 'E3', name: 'Pengukuran', content: 'Peserta didik dapat mengukur panjang dan berat benda menggunakan satuan baku.' },
        { id: 'elem-mat-4', code: 'E4', name: 'Geometri', content: 'Peserta didik dapat mendeskripsikan ciri berbagai bentuk bangun datar.' },
      ],
    };

    const matReqId = 'cp4-mat-00000000-0000-4000-a000-000000000002';
    const matRes = await fetch(`${baseUrl}/api/ai/analyze-cp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CP4-Request-ID': matReqId,
      },
      body: JSON.stringify(matBody),
    });

    const matMime = matRes.headers.get('content-type') || '';
    const matJson = await matRes.json();
    console.log(`[PASS 4] POST /api/ai/analyze-cp Matematika -> Status: ${matRes.status}, MIME: ${matMime}, Items Count: ${matJson.data?.items?.length || 0}`);
    if (matRes.status !== 200 || !matMime.includes('application/json') || matJson.data?.items?.length !== 4) {
      throw new Error('Matematika 4 Elemen analysis failed');
    }

    // Test 5: Stress test - 10 repeated calls for Bahasa Indonesia & Matematika
    console.log('--- Running 10 repeated calls for stability check ---');
    for (let i = 1; i <= 10; i++) {
      const isBindo = i % 2 === 1;
      const targetBody = isBindo ? bindoBody : matBody;
      const label = isBindo ? `Bahasa Indonesia #${i}` : `Matematika #${i}`;
      const reqId = `cp4-repeat-0000-0000-4000-a000-${String(i).padStart(12, '0')}`;
      const res = await fetch(`${baseUrl}/api/ai/analyze-cp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CP4-Request-ID': reqId,
        },
        body: JSON.stringify(targetBody),
      });

      const mime = res.headers.get('content-type') || '';
      if (res.status !== 200 || !mime.includes('application/json')) {
        throw new Error(`Repeat run ${label} failed! Status: ${res.status}, MIME: ${mime}`);
      }
    }
    console.log('[PASS 5] 10/10 repeated calls succeeded consistently with JSON response!');

    console.log('\n==================================================');
    console.log('ALL CP4 DIAGNOSTIC TESTS PASSED SUCCESSFULLY! (100% JSON)');
    console.log('==================================================');
  } finally {
    server.close();
  }
}

runDiagnostic().catch((err) => {
  console.error('DIAGNOSTIC AUDIT FAILED:', err);
  process.exit(1);
});
