const {BACKEND_URL,BUILD_TOKEN,RELEASE_ID,GITHUB_RUN_ID,GITHUB_RUN_ATTEMPT,RELEASE_RESULT}=process.env;
if(!RELEASE_ID)process.exit(0);
if(!BACKEND_URL||!BUILD_TOKEN)throw new Error('Missing publishing configuration');
const phase=process.argv[2];
const body={run_id:GITHUB_RUN_ID,attempt:GITHUB_RUN_ATTEMPT,result:RELEASE_RESULT};
for(let i=0;i<3;i++){try{const r=await fetch(new URL(`/build/releases/${encodeURIComponent(RELEASE_ID)}/${phase}`,BACKEND_URL),{method:'POST',headers:{Authorization:`Bearer ${BUILD_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(`Release ${phase} rejected (${r.status})`);process.exit(0)}catch(e){if(i===2)throw e;await new Promise(r=>setTimeout(r,1500));}}
