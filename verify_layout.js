import { fetch } from 'undici';

const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('1. Fetching dashboard (GET /)...');
  const res1 = await fetch(BASE_URL);
  if (!res1.ok) throw new Error(`Dashboard failed: ${res1.status}`);
  const html1 = await res1.text();
  
  // Check default order: hero -> about
  const heroIndex = html1.indexOf('id="hero"');
  const aboutIndex = html1.indexOf('id="about"');
  
  if (heroIndex !== -1 && aboutIndex !== -1 && heroIndex < aboutIndex) {
    console.log('✅ Default order correct (Hero before About)');
  } else {
    console.error('❌ Default order incorrect!', { heroIndex, aboutIndex });
  }
}

main().catch(console.error);
