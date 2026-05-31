import { defineConfig } from 'vite';

export default defineConfig({
    // GitHub Pagesでサブディレクトリ（/_sandbox/など）にデプロイされることを想定し、
    // 相対パスベースでアセットを読み込むように設定します。
    base: './',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
    }
});
