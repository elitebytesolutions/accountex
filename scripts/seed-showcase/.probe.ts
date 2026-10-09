import { Api } from './client.ts';
process.loadEnvFile('.env');
const a = new Api('http://localhost:3000/api', 'probe');
await a.login('/auth/login', { email: process.env.SHOWCASE_USER_EMAIL, password: process.env.SHOWCASE_USER_PASSWORD, companyCode: 'showcase' });
for (const p of process.argv.slice(2)) {
  const r: any = await a.get(p);
  const show = (o: any) => JSON.stringify(o, (k, v) => Array.isArray(v) && v.length > 4 && typeof v[0] === 'object' ? [...v.slice(0, 2), `…${v.length}`] : v);
  console.log('==', p, show(r).slice(0, 4000));
}
