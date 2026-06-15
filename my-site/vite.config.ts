import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { mkdirSync, writeFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** dev 전용: POST /api/save-label → my-site/data/labels/{filename}.json 저장.
 * Phase A 라벨링 도구 (/dev/label) 의 "JSON 저장" 버튼이 이 endpoint 호출. */
function saveLabelDevApi(): Plugin {
  return {
    name: 'save-label-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/save-label', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString('utf-8');
        });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body) as { filename?: string; content?: unknown };
            const safeName = (payload.filename || `labels-${Date.now()}.json`).replace(/[^a-zA-Z0-9._-]/g, '_');
            const dir = resolve(__dirname, 'data/labels');
            mkdirSync(dir, { recursive: true });
            const fullPath = resolve(dir, safeName);
            writeFileSync(fullPath, JSON.stringify(payload.content ?? {}, null, 2), 'utf-8');
            // repo 상대 경로로 응답 (사용자가 경로 알기 쉽게)
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ savedPath: fullPath, relative: `my-site/data/labels/${safeName}` }));
          } catch (e) {
            res.statusCode = 500;
            res.end(`save failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), saveLabelDevApi()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
