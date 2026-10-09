import makeBase from '../vite.config.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const base = makeBase({command:'build'});
export default {...base, build: {...base.build, outDir: path.resolve(dir, '../qa-dist'), rollupOptions: {input: {editor:path.resolve(dir,'../qa.html'),shell:path.resolve(dir,'../shell-qa.html')}}}};
