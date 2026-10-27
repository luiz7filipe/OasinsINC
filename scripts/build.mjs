import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('build/server',{recursive:true});
await build({entryPoints:['client/account.js'],outfile:'dist/account.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
await build({entryPoints:['server/index.ts'],outfile:'build/server/index.js',bundle:true,format:'esm',platform:'neutral',mainFields:['module','main'],conditions:['workerd','worker','browser'],external:['cloudflare:*','node:*'],target:'es2022',minify:true});
console.log('Oasis client and Worker built.');
await build({entryPoints:['server/node.ts'],outfile:'build/vps/server.mjs',bundle:true,format:'esm',platform:'node',target:'node24',banner:{js:"import {createRequire as __oasisCreateRequire} from 'node:module';const require=__oasisCreateRequire(import.meta.url);"}});
console.log('Oasis VPS server built.');
