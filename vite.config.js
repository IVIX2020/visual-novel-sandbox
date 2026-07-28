import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

function formatTitle(id) {
    if (id === 'the_house') return '🏠 The House [祖父の記憶と家]';
    if (id === 'cyber_tokyo') return '🌆 Cyber Tokyo 2099 [電脳街の路地裏]';
    if (id === 'the_morning_cafe') return '☕ The Morning Cafe [朝のカフェ]';
    if (id === 'the_seaside_cafe') return '☕ The Seaside Cafe [海辺のカフェ]';
    if (id === '桃太郎') return '📖 桃太郎';
    
    const formattedName = id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return `📖 ${formattedName}`;
}

export default defineConfig({
    base: './',
    build: {
        outDir: 'docs',
        emptyOutDir: false,
        assetsDir: 'assets',
    },
    server: {
        fs: {
            allow: ['.']
        }
    },
    plugins: [
        {
            name: 'vault-direct-server',
            configureServer(server) {
                const vaultsPath = path.resolve('vaults');

                // /vaults/manifest.json の動的生成レスポンス
                server.middlewares.use((req, res, next) => {
                    const decodedUrl = decodeURIComponent(req.url);
                    if (decodedUrl === '/vaults/manifest.json' || decodedUrl === '/vaults/manifest.json/') {
                        if (!fs.existsSync(vaultsPath)) fs.mkdirSync(vaultsPath, { recursive: true });
                        const items = fs.readdirSync(vaultsPath, { withFileTypes: true });
                        const manifest = items
                            .filter(item => item.isDirectory() && !item.name.startsWith('.'))
                            .map(item => ({
                                id: item.name,
                                name: formatTitle(item.name)
                            }));
                        res.setHeader('Content-Type', 'application/json; charset=utf-8');
                        return res.end(JSON.stringify(manifest));
                    }
                    next();
                });

                // /vaults/ 配下へのリクエストをルート直下の vaults/ から直接サーブ！
                server.middlewares.use('/vaults', (req, res, next) => {
                    const reqPath = decodeURIComponent(req.url.split('?')[0]);
                    const filePath = path.join(vaultsPath, reqPath);
                    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                        const buffer = fs.readFileSync(filePath);
                        res.setHeader('Access-Control-Allow-Origin', '*');
                        return res.end(buffer);
                    }
                    next();
                });
            }
        }
    ]
});
